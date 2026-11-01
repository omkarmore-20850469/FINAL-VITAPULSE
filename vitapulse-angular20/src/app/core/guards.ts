import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { ApiService } from './api.service';

export const authGuard: CanActivateFn = async () => {
  const api = inject(ApiService);
  const router = inject(Router);
  return await api.validateSession() ? true : router.createUrlTree(['/login']);
};

export const guestGuard: CanActivateFn = async () => {
  const api = inject(ApiService);
  const router = inject(Router);
  if (!api.user()) return true;
  return await api.validateSession() ? router.createUrlTree(['/']) : true;
};
