import { CommonModule, isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { AfterViewInit, Component, Inject, OnInit, PLATFORM_ID } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { Chart, registerables } from 'chart.js';
import { AuthService } from '../auth/auth.service';

Chart.register(...registerables);

interface DashboardStats {
  totalUsers: number;
  totalSales: number;
  totalProducts: number;
  totalOrders: number;
}

interface DashboardUser {
  id: number;
  firstName: string;
  lastName: string;
  gamertag: string;
  email: string;
  status: 'pending' | 'active' | 'suspended' | 'deleted';
  roleName: string;
  career: string;
  createdAt: string;
}

interface DashboardQuizQuestion {
  text: string;
  hint: string;
  options: string[];
  correct: number;
}

interface DashboardQuiz {
  id: number;
  title: string;
  description: string;
  icon: string;
  difficulty: 'easy' | 'mid' | 'hard';
  timePerQuestion: number;
  isActive: boolean;
  questions: DashboardQuizQuestion[];
}

interface DashboardProduct {
  id: number;
  title: string;
  price: number;
  status: string;
  category: string;
  seller: string;
  createdAt: string;
}

interface DashboardNews {
  id: number;
  title: string;
  summary: string;
  category: string;
  status: string;
  author: string;
  createdAt: string;
}

interface DashboardResponse {
  stats: DashboardStats;
  categoryChart: {
    labels: string[];
    values: number[];
  };
  activityChart: {
    labels: string[];
    values: number[];
  };
  extraMetrics: {
    overview: {
      suspendedUsers: number;
      activeQuizzes: number;
      publishedNews: number;
      totalQuizAttempts: number;
    };
    userStatusChart: {
      labels: string[];
      values: number[];
    };
    quizActivityChart: {
      labels: string[];
      values: number[];
    };
    moduleChart: {
      labels: string[];
      values: number[];
    };
  };
  users: DashboardUser[];
  quizzes: DashboardQuiz[];
  products: DashboardProduct[];
  news: DashboardNews[];
}

interface DashboardMessageResponse {
  message: string;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css'],
})
export class DashboardComponent implements OnInit, AfterViewInit {
  readonly tabs = ['analytics', 'users', 'quizzes', 'products', 'news'] as const;
  activeTab: (typeof this.tabs)[number] = 'analytics';

  stats: DashboardStats = {
    totalUsers: 0,
    totalSales: 0,
    totalProducts: 0,
    totalOrders: 0,
  };

  users: DashboardUser[] = [];
  quizzes: DashboardQuiz[] = [];
  products: DashboardProduct[] = [];
  news: DashboardNews[] = [];

  categoryChartData = {
    labels: [] as string[],
    values: [] as number[],
  };

  activityChartData = {
    labels: [] as string[],
    values: [] as number[],
  };

  userStatusChartData = {
    labels: [] as string[],
    values: [] as number[],
  };

  quizActivityChartData = {
    labels: [] as string[],
    values: [] as number[],
  };

  moduleChartData = {
    labels: [] as string[],
    values: [] as number[],
  };

  extraStats = {
    suspendedUsers: 0,
    activeQuizzes: 0,
    publishedNews: 0,
    totalQuizAttempts: 0,
  };

  quizForm: DashboardQuiz = this.createEmptyQuiz();
  newsForm = {
    title: '',
    summary: '',
    category: 'Noticias',
    content: '',
    imageData: '',
  };

  loading = true;
  feedback = '';
  error = '';
  private chartsReady = false;

  constructor(
    private readonly http: HttpClient,
    readonly authService: AuthService,
    private readonly router: Router,
    @Inject(PLATFORM_ID) private readonly platformId: object,
  ) {}

  ngOnInit(): void {
    this.loadDashboard();
  }

  ngAfterViewInit(): void {
    this.chartsReady = true;
    this.tryRenderCharts();
  }

  setTab(tab: (typeof this.tabs)[number]): void {
    this.activeTab = tab;
    if (tab === 'analytics') {
      this.tryRenderCharts();
    }
  }

  logout(): void {
    this.authService.clearUser();
    this.router.navigate(['/']);
  }

  saveUser(user: DashboardUser): void {
    this.clearMessages();

    this.http
      .patch<DashboardMessageResponse>(`/api/admin/users/${user.id}`, {
        firstName: user.firstName,
        lastName: user.lastName,
        gamertag: user.gamertag,
        email: user.email,
        status: user.status,
      })
      .subscribe({
        next: (response) => {
          this.feedback = response.message;
          this.loadDashboard(false);
        },
        error: (error) => {
          console.error('Error updating user:', error);
          this.error = error.error?.message || 'No se pudo actualizar el usuario.';
        },
      });
  }

  deactivateUser(user: DashboardUser): void {
    user.status = 'suspended';
    this.saveUser(user);
  }

  editQuiz(quiz: DashboardQuiz): void {
    this.quizForm = {
      ...quiz,
      questions: quiz.questions.map((question) => ({
        text: question.text,
        hint: question.hint,
        correct: question.correct,
        options: [...question.options],
      })),
    };
    this.setTab('quizzes');
  }

  resetQuizForm(): void {
    this.quizForm = this.createEmptyQuiz();
  }

  addQuestion(): void {
    this.quizForm.questions.push({
      text: '',
      hint: '',
      correct: 0,
      options: ['', '', '', ''],
    });
  }

  removeQuestion(index: number): void {
    if (this.quizForm.questions.length === 1) {
      return;
    }

    this.quizForm.questions.splice(index, 1);
  }

  saveQuiz(): void {
    this.clearMessages();
    const currentUser = this.authService.currentUser();

    if (!currentUser) {
      this.error = 'No encontramos la sesion del administrador.';
      return;
    }

    const payload = {
      adminUserId: currentUser.id,
      title: this.quizForm.title,
      description: this.quizForm.description,
      icon: this.quizForm.icon,
      difficulty: this.quizForm.difficulty,
      timePerQuestion: this.quizForm.timePerQuestion,
      isActive: this.quizForm.isActive,
      questions: this.quizForm.questions,
    };

    const request = this.quizForm.id
      ? this.http.put<DashboardMessageResponse>(`/api/admin/quizzes/${this.quizForm.id}`, payload)
      : this.http.post<DashboardMessageResponse>('/api/admin/quizzes', payload);

    request.subscribe({
      next: (response) => {
        this.feedback = response.message;
        this.resetQuizForm();
        this.loadDashboard(false);
      },
      error: (error) => {
        console.error('Error saving quiz:', error);
        this.error = error.error?.message || 'No se pudo guardar el quiz.';
      },
    });
  }

  disableQuiz(quiz: DashboardQuiz): void {
    this.clearMessages();

    this.http.delete<DashboardMessageResponse>(`/api/admin/quizzes/${quiz.id}`).subscribe({
      next: (response) => {
        this.feedback = response.message;
        this.loadDashboard(false);
      },
      error: (error) => {
        console.error('Error disabling quiz:', error);
        this.error = error.error?.message || 'No se pudo desactivar el quiz.';
      },
    });
  }

  removeProduct(product: DashboardProduct): void {
    this.clearMessages();

    this.http.delete<DashboardMessageResponse>(`/api/admin/products/${product.id}`).subscribe({
      next: (response) => {
        this.feedback = response.message;
        this.loadDashboard(false);
      },
      error: (error) => {
        console.error('Error deleting product:', error);
        this.error = error.error?.message || 'No se pudo retirar el producto.';
      },
    });
  }

  onNewsImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      this.newsForm.imageData = typeof reader.result === 'string' ? reader.result : '';
    };
    reader.readAsDataURL(file);
  }

  clearNewsImage(): void {
    this.newsForm.imageData = '';
  }

  publishNews(): void {
    this.clearMessages();
    const currentUser = this.authService.currentUser();

    if (!currentUser) {
      this.error = 'No encontramos la sesion del administrador.';
      return;
    }

    this.http
      .post<DashboardMessageResponse>('/api/admin/news', {
        adminUserId: currentUser.id,
        title: this.newsForm.title,
        summary: this.newsForm.summary,
        category: this.newsForm.category,
        content: this.newsForm.content,
        imageData: this.newsForm.imageData,
      })
      .subscribe({
        next: (response) => {
          this.feedback = response.message;
          this.newsForm = {
            title: '',
            summary: '',
            category: 'Noticias',
            content: '',
            imageData: '',
          };
          this.loadDashboard(false);
        },
        error: (error) => {
          console.error('Error publishing news:', error);
          this.error = error.error?.message || 'No se pudo publicar la noticia.';
        },
      });
  }

  archiveNews(news: DashboardNews): void {
    this.clearMessages();

    this.http.delete<DashboardMessageResponse>(`/api/admin/news/${news.id}`).subscribe({
      next: (response) => {
        this.feedback = response.message;
        this.loadDashboard(false);
      },
      error: (error) => {
        console.error('Error archiving news:', error);
        this.error = error.error?.message || 'No se pudo archivar la noticia.';
      },
    });
  }

  private loadDashboard(markLoading = true): void {
    if (markLoading) {
      this.loading = true;
    }

    this.http.get<DashboardResponse>('/api/dashboard', { transferCache: false }).subscribe({
      next: (response) => {
        this.stats = response.stats;
        this.categoryChartData = response.categoryChart;
        this.activityChartData = response.activityChart;
        this.extraStats = response.extraMetrics.overview;
        this.userStatusChartData = response.extraMetrics.userStatusChart;
        this.quizActivityChartData = response.extraMetrics.quizActivityChart;
        this.moduleChartData = response.extraMetrics.moduleChart;
        this.users = response.users;
        this.quizzes = response.quizzes;
        this.products = response.products;
        this.news = response.news;
        this.loading = false;
        this.tryRenderCharts();
      },
      error: (error) => {
        console.error('Error loading dashboard:', error);
        this.error = error.error?.message || 'No se pudo cargar el dashboard.';
        this.loading = false;
      },
    });
  }

  private tryRenderCharts(): void {
    if (!this.chartsReady || !isPlatformBrowser(this.platformId)) {
      return;
    }

    this.createActivityChart();
    this.createCategoryChart();
    this.createUserStatusChart();
    this.createQuizActivityChart();
    this.createModuleChart();
  }

  private createActivityChart(): void {
    const ctx = document.getElementById('activityChart') as HTMLCanvasElement | null;
    if (!ctx) {
      return;
    }

    Chart.getChart(ctx)?.destroy();

    new Chart(ctx, {
      type: 'bar',
      data: {
        labels: this.activityChartData.labels,
        datasets: [
          {
            label: 'Actividad',
            data: this.activityChartData.values,
            backgroundColor: 'rgba(0, 240, 255, 0.22)',
            borderColor: 'rgba(0, 240, 255, 1)',
            borderWidth: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
          },
        },
      },
    });
  }

  private createCategoryChart(): void {
    const ctx = document.getElementById('categoryChart') as HTMLCanvasElement | null;
    if (!ctx) {
      return;
    }

    Chart.getChart(ctx)?.destroy();

    new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: this.categoryChartData.labels,
        datasets: [
          {
            data: this.categoryChartData.values,
            backgroundColor: [
              'rgba(255, 60, 110, 0.25)',
              'rgba(0, 240, 255, 0.25)',
              'rgba(245, 196, 0, 0.25)',
              'rgba(162, 89, 255, 0.25)',
            ],
            borderColor: [
              'rgba(255, 60, 110, 1)',
              'rgba(0, 240, 255, 1)',
              'rgba(245, 196, 0, 1)',
              'rgba(162, 89, 255, 1)',
            ],
            borderWidth: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
      },
    });
  }

  private createUserStatusChart(): void {
    const ctx = document.getElementById('userStatusChart') as HTMLCanvasElement | null;
    if (!ctx) {
      return;
    }

    Chart.getChart(ctx)?.destroy();

    new Chart(ctx, {
      type: 'pie',
      data: {
        labels: this.userStatusChartData.labels,
        datasets: [
          {
            data: this.userStatusChartData.values,
            backgroundColor: [
              'rgba(0, 255, 136, 0.25)',
              'rgba(245, 196, 0, 0.25)',
              'rgba(255, 60, 110, 0.25)',
              'rgba(162, 89, 255, 0.25)',
            ],
            borderColor: [
              'rgba(0, 255, 136, 1)',
              'rgba(245, 196, 0, 1)',
              'rgba(255, 60, 110, 1)',
              'rgba(162, 89, 255, 1)',
            ],
            borderWidth: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
      },
    });
  }

  private createQuizActivityChart(): void {
    const ctx = document.getElementById('quizActivityChart') as HTMLCanvasElement | null;
    if (!ctx) {
      return;
    }

    Chart.getChart(ctx)?.destroy();

    new Chart(ctx, {
      type: 'line',
      data: {
        labels: this.quizActivityChartData.labels,
        datasets: [
          {
            label: 'Intentos de quiz',
            data: this.quizActivityChartData.values,
            borderColor: 'rgba(255, 60, 110, 1)',
            backgroundColor: 'rgba(255, 60, 110, 0.14)',
            fill: true,
            tension: 0.35,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
      },
    });
  }

  private createModuleChart(): void {
    const ctx = document.getElementById('moduleChart') as HTMLCanvasElement | null;
    if (!ctx) {
      return;
    }

    Chart.getChart(ctx)?.destroy();

    new Chart(ctx, {
      type: 'radar',
      data: {
        labels: this.moduleChartData.labels,
        datasets: [
          {
            label: 'Contenido actual',
            data: this.moduleChartData.values,
            borderColor: 'rgba(0, 240, 255, 1)',
            backgroundColor: 'rgba(0, 240, 255, 0.16)',
            pointBackgroundColor: 'rgba(0, 240, 255, 1)',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
      },
    });
  }

  private createEmptyQuiz(): DashboardQuiz {
    return {
      id: 0,
      title: '',
      description: '',
      icon: 'GG',
      difficulty: 'easy',
      timePerQuestion: 20,
      isActive: true,
      questions: [
        {
          text: '',
          hint: '',
          correct: 0,
          options: ['', '', '', ''],
        },
      ],
    };
  }

  private clearMessages(): void {
    this.feedback = '';
    this.error = '';
  }
}
