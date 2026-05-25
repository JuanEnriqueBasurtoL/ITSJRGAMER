import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { AuthService } from '../auth/auth.service';

@Component({
  selector: 'app-access-required',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './access-required.component.html',
  styleUrls: ['./access-required.component.css'],
})
export class AccessRequiredComponent implements OnInit {
  returnUrl = '/';
  feature = 'contenido';

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly authService: AuthService,
  ) {}

  ngOnInit(): void {
    this.returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') || '/';
    this.feature = this.route.snapshot.queryParamMap.get('feature') || 'contenido';

    if (this.authService.isLoggedIn()) {
      this.router.navigateByUrl(this.returnUrl);
    }
  }

  get title(): string {
    return this.feature === 'quiz' ? 'Aun no puedes jugar este quiz' : 'Aun no puedes publicar aqui';
  }

  get description(): string {
    if (this.feature === 'quiz') {
      return 'Para acceder a los quizzes necesitas iniciar sesion o crear tu cuenta gamer en ITSJR Gamer.';
    }

    return 'Para publicar articulos en el marketplace necesitas iniciar sesion o registrarte en ITSJR Gamer.';
  }
}
