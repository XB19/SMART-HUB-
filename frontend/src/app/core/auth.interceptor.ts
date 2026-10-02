import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from './auth.service';

/**
 * Attache le token JWT et rejoue la requête après refresh sur 401.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const token = auth.accessToken;

  // Les routes d'authentification se passent de jeton — le SSO comprise :
  // on n'en a pas encore quand on échange son code. Y joindre un jeton
  // périmé traînant dans localStorage n'apporterait rien.
  const estAuthEndpoint = req.url.includes('/auth/token')
    || req.url.includes('/auth/refresh')
    || req.url.includes('/auth/sso/');
  const requete = token && !estAuthEndpoint
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(requete).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status === 401 && token && !estAuthEndpoint && auth.refreshToken) {
        return auth.rafraichir().pipe(
          switchMap(() =>
            next(req.clone({ setHeaders: { Authorization: `Bearer ${auth.accessToken}` } }))
          ),
          catchError((e) => {
            auth.deconnexion();
            return throwError(() => e);
          })
        );
      }
      return throwError(() => err);
    })
  );
};
