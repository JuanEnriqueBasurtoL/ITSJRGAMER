import { Routes } from '@angular/router';
import { IndexComponent } from './index/index.component';
import { LoginComponent } from './login/login.component';
import { RegisterComponent } from './register/register.component';
import { QuizComponent } from './quiz/quiz.component';
import { MarketplaceComponent } from './marketplace/marketplace.component';
import { DashboardComponent } from './dashboard/dashboard.component';
import { AccessRequiredComponent } from './access-required/access-required.component';
import { authRequiredGuard } from './auth/auth-required.guard';
import { adminRequiredGuard } from './auth/admin-required.guard';

export const routes: Routes = [
  { path: '', component: IndexComponent },
  { path: 'login', component: LoginComponent },
  { path: 'register', component: RegisterComponent },
  { path: 'acceso-requerido', component: AccessRequiredComponent },
  { path: 'quiz', component: QuizComponent, canActivate: [authRequiredGuard] },
  { path: 'marketplace', component: MarketplaceComponent },
  { path: 'dashboard', component: DashboardComponent, canActivate: [adminRequiredGuard] },
];
