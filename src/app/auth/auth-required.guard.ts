import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const authRequiredGuard: CanActivateFn = (_route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isLoggedIn()) {
    return true;
  }

  const feature = state.url.startsWith('/quiz') ? 'quiz' : 'marketplace';

  return router.createUrlTree(['/acceso-requerido'], {
    queryParams: {
      returnUrl: state.url,
      feature,
    },
  });
};
