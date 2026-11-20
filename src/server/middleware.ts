import type express from 'express';
import { bearer, HttpError, type Identity } from './security';
import type { Repository } from './firestoreRepository';
export function authenticate(verify: (token: string) => Promise<Identity>, repository: (token: string) => Repository, allowedRoles: readonly string[]): express.RequestHandler {
  return (req, res, next) => {
    void (async () => {
      const identity = await verify(bearer(req));
      const store = repository(identity.token);
      const profile = await store.get('users', identity.uid);
      if (!profile || profile.aktif !== true || !allowedRoles.includes(profile.roleId)) throw new HttpError(403, 'Akun belum diaktifkan atau hak akses belum ditetapkan administrator.');
      res.locals.identity = identity; res.locals.profile = profile; res.locals.store = store;
      next();
    })().catch(next);
  };
}
