/**
 * OneBastion Platform SSO Endpoint
 *
 * GET /api/v1/auth/platform-sso?token=<JWT>&redirect=<path>
 *
 * Accepts a short-lived JWT issued by the OneBastion platform, verifies it
 * using HMAC-SHA256 with the shared ONEBASTION_PLATFORM_SECRET, finds or
 * creates the user in DemoForge's Supabase project, generates a magic
 * link, and redirects the browser to the magic link action URL.
 *
 * This endpoint is NOT behind normal API-key/JWT auth — it is self-authenticated
 * via the platform-issued JWT token in the query string.
 */

import { FastifyPluginAsync } from 'fastify';
import { verifyPlatformJwt } from '../lib/hmac.js';
import { getSupabaseClient } from '../lib/supabase.js';

export const platformSsoRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/auth/platform-sso', async (request, reply) => {
    const query = request.query as { token?: string; redirect?: string };

    // 1. Validate query parameters
    if (!query.token) {
      fastify.log.warn('Platform SSO: missing token parameter');
      return reply.status(400).send({
        error: 'Bad Request',
        error_code: 'MISSING_TOKEN',
        message: 'The "token" query parameter is required',
      });
    }

    // 2. Verify ONEBASTION_PLATFORM_SECRET is configured
    const platformSecret = process.env.ONEBASTION_PLATFORM_SECRET;
    if (!platformSecret) {
      fastify.log.error(
        'Platform SSO: ONEBASTION_PLATFORM_SECRET is not configured',
      );
      return reply.status(500).send({
        error: 'Internal Server Error',
        error_code: 'SSO_NOT_CONFIGURED',
        message: 'Platform SSO is not configured',
      });
    }

    // 3. Verify the JWT
    const payload = verifyPlatformJwt(query.token, platformSecret);
    if (!payload) {
      fastify.log.warn('Platform SSO: JWT verification failed');
      return reply.status(401).send({
        error: 'Unauthorized',
        error_code: 'INVALID_TOKEN',
        message: 'Invalid or expired platform SSO token',
      });
    }

    fastify.log.info(
      {
        userId: payload.sub,
        email: payload.email,
        orgId: payload.org_id,
        productId: payload.product_id,
      },
      'Platform SSO: token verified',
    );

    // 4. Get Supabase admin client
    const supabase = getSupabaseClient();

    // 5. Find or create user
    let userId: string;
    try {
      // List users filtered by email
      const { data: listData, error: listError } =
        await supabase.auth.admin.listUsers({
          page: 1,
          perPage: 1,
        });

      if (listError) {
        fastify.log.error(
          { error: listError.message },
          'Platform SSO: failed to list users',
        );
        return reply.status(500).send({
          error: 'Internal Server Error',
          error_code: 'USER_LOOKUP_FAILED',
          message: 'Failed to look up user',
        });
      }

      // Search through users for matching email
      const existingUser = listData.users.find(
        (u) => u.email === payload.email,
      );

      if (existingUser) {
        // Update user metadata to keep org info current
        const { error: updateError } =
          await supabase.auth.admin.updateUserById(existingUser.id, {
            user_metadata: {
              org_id: payload.org_id,
              org_name: payload.org_name,
              platform_user_id: payload.sub,
            },
          });

        if (updateError) {
          fastify.log.warn(
            { error: updateError.message, userId: existingUser.id },
            'Platform SSO: failed to update user metadata (non-fatal)',
          );
        }

        userId = existingUser.id;
        fastify.log.info(
          { userId, email: payload.email },
          'Platform SSO: existing user found',
        );
      } else {
        // Create new user
        const { data: createData, error: createError } =
          await supabase.auth.admin.createUser({
            email: payload.email,
            email_confirm: true,
            user_metadata: {
              org_id: payload.org_id,
              org_name: payload.org_name,
              platform_user_id: payload.sub,
            },
          });

        if (createError) {
          fastify.log.error(
            { error: createError.message },
            'Platform SSO: failed to create user',
          );
          return reply.status(500).send({
            error: 'Internal Server Error',
            error_code: 'USER_CREATION_FAILED',
            message: 'Failed to create user account',
          });
        }

        userId = createData.user.id;
        fastify.log.info(
          { userId, email: payload.email },
          'Platform SSO: new user created',
        );
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      fastify.log.error(
        { error: errMsg },
        'Platform SSO: unexpected error during user lookup/creation',
      );
      return reply.status(500).send({
        error: 'Internal Server Error',
        error_code: 'USER_PROVISION_FAILED',
        message: 'Failed to provision user account',
      });
    }

    // 6. Generate magic link
    const redirectPath = query.redirect || '/';
    let actionLink: string;

    try {
      const { data: linkData, error: linkError } =
        await supabase.auth.admin.generateLink({
          type: 'magiclink',
          email: payload.email,
          options: {
            redirectTo: redirectPath,
          },
        });

      if (linkError || !linkData?.properties?.action_link) {
        const errMsg = linkError?.message || 'No action_link returned';
        fastify.log.error(
          { error: errMsg },
          'Platform SSO: failed to generate magic link',
        );
        return reply.status(500).send({
          error: 'Internal Server Error',
          error_code: 'MAGIC_LINK_FAILED',
          message: 'Failed to generate authentication link',
        });
      }

      actionLink = linkData.properties.action_link;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      fastify.log.error(
        { error: errMsg },
        'Platform SSO: unexpected error generating magic link',
      );
      return reply.status(500).send({
        error: 'Internal Server Error',
        error_code: 'MAGIC_LINK_ERROR',
        message: 'Failed to generate authentication link',
      });
    }

    // 7. Append redirect_to param if not already present and redirect
    const linkUrl = new URL(actionLink);
    if (!linkUrl.searchParams.has('redirect_to') && redirectPath !== '/') {
      linkUrl.searchParams.set('redirect_to', redirectPath);
    }

    fastify.log.info(
      { userId, email: payload.email, redirectPath },
      'Platform SSO: redirecting to magic link',
    );

    return reply.redirect(302, linkUrl.toString());
  });
};

export default platformSsoRoutes;
