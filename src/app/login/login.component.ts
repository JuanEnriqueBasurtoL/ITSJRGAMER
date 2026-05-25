import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { AuthService } from '../auth/auth.service';

interface LoginResponse {
  message: string;
  user: {
    id: number;
    username: string;
    email: string;
    roleId: number;
    roleName: string;
  };
}

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css'],
})
export class LoginComponent {
  form = {
    email: '',
    password: '',
  };

  error = '';
  message = '';
  returnUrl = '/';

  constructor(
    private readonly http: HttpClient,
    private readonly router: Router,
    private readonly route: ActivatedRoute,
    private readonly authService: AuthService,
  ) {
    this.returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') || '/';
  }

  submit(): void {
    this.error = '';
    this.message = '';

    this.http.post<LoginResponse>('/api/auth/login', this.form).subscribe({
      next: (response) => {
        this.message = response.message;
        this.authService.setUser(response.user);
        setTimeout(() => {
          if (response.user.roleName === 'admin' && this.returnUrl === '/') {
            this.router.navigate(['/dashboard']);
            return;
          }

          this.router.navigateByUrl(this.returnUrl);
        }, 800);
      },
      error: (error) => {
        console.error('Error logging in:', error);
        this.error = error.error?.message || 'No se pudo iniciar sesion.';
      },
    });
  }
}
