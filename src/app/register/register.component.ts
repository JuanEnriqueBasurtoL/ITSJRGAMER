import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.css'],
})
export class RegisterComponent {
  form = {
    firstName: '',
    lastName: '',
    email: '',
    username: '',
    password: '',
    confirmPassword: '',
    career: '',
    termsAccepted: false,
  };

  message = '';
  error = '';
  returnUrl = '/';

  constructor(
    private readonly http: HttpClient,
    private readonly router: Router,
    private readonly route: ActivatedRoute,
  ) {
    this.returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') || '/';
  }

  onPasswordInput(event: Event): void {
    const pwd = (event.target as HTMLInputElement).value;
    const bar = document.getElementById('strengthBar');
    let s = 0;
    if (pwd.length >= 8) s++;
    if (/[A-Z]/.test(pwd)) s++;
    if (/[0-9]/.test(pwd)) s++;
    if (/[^A-Za-z0-9]/.test(pwd)) s++;
    const colors = ['', '#ff3c6e', '#f5c400', '#00f0ff', '#00ff88'];
    const widths = ['0%', '25%', '50%', '75%', '100%'];
    if (bar) {
      bar.style.width = widths[s];
      bar.style.background = colors[s];
    }
  }

  submit(): void {
    this.message = '';
    this.error = '';

    this.http.post<{ message: string }>('/api/auth/register', this.form).subscribe({
      next: (response) => {
        this.message = response.message;
        setTimeout(() => {
          this.router.navigate(['/login'], {
            queryParams: { returnUrl: this.returnUrl },
          });
        }, 1000);
      },
      error: (error) => {
        console.error('Error registering user:', error);
        this.error = error.error?.message || 'No se pudo crear la cuenta.';
      },
    });
  }
}
