import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';
import { Login } from './pages/login/login';
import { Dashboard } from './pages/dashboard/dashboard';
import { Gestion } from './pages/gestion/gestion';

export const routes: Routes = [
  { path: 'login', component: Login },
  { path: 'consultas', component: Dashboard, canActivate: [authGuard] },
  { path: 'gestion', component: Gestion, canActivate: [authGuard] },
  { path: '', pathMatch: 'full', redirectTo: 'consultas' },
  { path: '**', redirectTo: 'consultas' },
];
