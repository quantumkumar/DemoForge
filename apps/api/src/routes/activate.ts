import { FastifyPluginAsync } from 'fastify';
import { verifyHmac } from '../lib/hmac.js';
import { getSupabaseClient, getSupabaseConfig } from '../lib/supabase.js';
import { runDay0Activation } from '../services/day0Activation.js';

/**
 * POST /api/v1/activate
 *
 * CloudEvents activation endpoint called by the OneBastion platform
 * when an organization purchases DemoForge.
 *
 * 1. Verify HMAC-SHA256 signature
 * 2. Reject replay attacks (timestamp > 5 min old)
 * 3. Check idempotency (by idempotency_key in org_activations)
 * 4. Insert activation record
 * 5. Kick off Day 0 Playwright crawl in background
 * 6. Return { accepted: true, job_id }
 */
export const activateRoutes: FastifyPluginAsync = async (fastify) => {
  // Register raw body parsing for HMAC verification
  fastify.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (_req, body, done) => {
      done(null, body);
    },
  );

  fastify.post('/activate', async (request, reply) => {
    const platformSecret = process.env.ONEBASTION_PLATFORM_SECRET;
    if (!platformSecret) {
      fastify.log.error('ONEBASTION_PLATFORM_SECRET is not configured');
      return reply.status(500).send({
        error: 'Internal Server Error',
        error_code: 'NOT_CONFIGURED',
        message: 'Activation endpoint is not configured',
      });
    }

    // ---------------------------------------------------------------
    // 1. Get raw body and verify HMAC
    // ---------------------------------------------------------------
    const rawBody = request.body as Buffer;
    const signature = request.headers['x-onebastion-signature'] as
      | string
      | undefined;
    const timestamp = request.headers['x-onebastion-timestamp'] as
      | string
      | undefined;

    if (!signature || !timestamp) {
      return reply.status(401).send({
        error: 'Unauthorized',
        error_code: 'MISSING_SIGNATURE',
        message: 'Missing X-OneBastion-Signature or X-OneBastion-Timestamp header',
      });
    }

    if (!verifyHmac(rawBody, signature, timestamp, platformSecret)) {
      fastify.log.warn('Activation: HMAC verification failed');
      return reply.status(401).send({
        error: 'Unauthorized',
        error_code: 'INVALID_SIGNATURE',
        message: 'HMAC signature verification failed',
      });
    }

    // ---------------------------------------------------------------
    // 2. Reject stale timestamps (> 5 minutes)
    // Supports both ISO 8601 and Unix timestamp formats.
    // ---------------------------------------------------------------
    const MAX_AGE_MS = 5 * 60 * 1000;
    let timestampMs: number;

    const tsInt = parseInt(timestamp, 10);
    if (!Number.isNaN(tsInt) && String(tsInt) === timestamp.trim()) {
      // Unix timestamp (seconds)
      timestampMs = tsInt * 1000;
    } else {
      // ISO 8601 string
      timestampMs = new Date(timestamp).getTime();
    }

    if (Number.isNaN(timestampMs) || Math.abs(Date.now() - timestampMs) > MAX_AGE_MS) {
      return reply.status(401).send({
        error: 'Unauthorized',
        error_code: 'STALE_TIMESTAMP',
        message: 'Timestamp is too old or invalid',
      });
    }

    // ---------------------------------------------------------------
    // 3. Parse body
    // ---------------------------------------------------------------
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody.toString('utf-8'));
    } catch {
      return reply.status(400).send({
        error: 'Bad Request',
        error_code: 'INVALID_JSON',
        message: 'Request body is not valid JSON',
      });
    }

    const data = payload.data as Record<string, unknown> | undefined;
    if (!data) {
      return reply.status(400).send({
        error: 'Bad Request',
        error_code: 'MISSING_DATA',
        message: 'CloudEvents payload must contain a "data" field',
      });
    }

    const orgId = data.org_id as string | undefined;
    const orgSlug = data.org_slug as string | undefined;
    const orgName = data.org_name as string | undefined;
    const productId = data.product_id as string | undefined;
    const callbackUrl = data.callback_url as string | undefined;
    const idempotencyKey = data.idempotency_key as string | undefined;

    const stackConfig = (data.stack as Record<string, unknown> | undefined)
      ?.demoforge as Record<string, unknown> | undefined;

    if (!orgId || !productId) {
      return reply.status(400).send({
        error: 'Bad Request',
        error_code: 'MISSING_REQUIRED_FIELDS',
        message: 'data.org_id and data.product_id are required',
      });
    }

    // ---------------------------------------------------------------
    // 4. Idempotency check
    // ---------------------------------------------------------------
    const supabase = getSupabaseClient();
    const { url: supabaseUrl, key: supabaseKey } = getSupabaseConfig();

    if (idempotencyKey) {
      const { data: existing, error: lookupError } = await supabase
        .from('org_activations')
        .select('job_id, status')
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle();

      if (lookupError) {
        fastify.log.error(
          { error: lookupError.message },
          'Activation: idempotency lookup failed',
        );
        return reply.status(500).send({
          error: 'Internal Server Error',
          error_code: 'DB_ERROR',
          message: 'Failed to check idempotency',
        });
      }

      if (existing) {
        fastify.log.info(
          { jobId: existing.job_id, status: existing.status },
          'Activation: idempotent duplicate — returning existing job',
        );
        return reply.status(200).send({
          accepted: true,
          job_id: existing.job_id,
          duplicate: true,
        });
      }
    }

    // ---------------------------------------------------------------
    // 5. Insert activation record
    // ---------------------------------------------------------------
    const jobId = crypto.randomUUID();

    const { error: insertError } = await supabase
      .from('org_activations')
      .insert({
        job_id: jobId,
        org_id: orgId,
        product_id: productId,
        idempotency_key: idempotencyKey || null,
        status: 'running',
        stack: stackConfig || null,
        created_at: new Date().toISOString(),
      });

    if (insertError) {
      fastify.log.error(
        { error: insertError.message },
        'Activation: failed to insert activation record',
      );
      return reply.status(500).send({
        error: 'Internal Server Error',
        error_code: 'DB_INSERT_FAILED',
        message: 'Failed to create activation record',
      });
    }

    // ---------------------------------------------------------------
    // 6. Kick off Day 0 worker in background
    // ---------------------------------------------------------------
    const targetUrl = (stackConfig?.target_url as string) || '';
    const targetUsername = (stackConfig?.username as string) || '';
    const targetPassword = (stackConfig?.password as string) || '';

    if (!targetUrl) {
      // Update status to failed — no target URL provided
      await supabase
        .from('org_activations')
        .update({
          status: 'failed',
          error_message: 'No target_url provided in stack.demoforge configuration',
        })
        .eq('job_id', jobId);

      return reply.status(400).send({
        error: 'Bad Request',
        error_code: 'MISSING_TARGET_URL',
        message: 'stack.demoforge.target_url is required for Day 0 activation',
      });
    }

    // Fire-and-forget with error handling
    runDay0Activation({
      orgId,
      orgSlug: orgSlug || '',
      orgName: orgName || '',
      targetUrl,
      targetUsername: targetUsername || undefined,
      targetPassword: targetPassword || undefined,
      callbackUrl: callbackUrl || '',
      apiKey: supabaseKey,
      jobId,
      supabaseUrl,
      supabaseKey,
    }).catch((err) => {
      fastify.log.error(
        { error: err instanceof Error ? err.message : String(err), jobId },
        'Day 0 activation worker threw an unhandled error',
      );
    });

    // ---------------------------------------------------------------
    // 7. Respond immediately
    // ---------------------------------------------------------------
    return reply.status(202).send({
      accepted: true,
      job_id: jobId,
    });
  });
};
