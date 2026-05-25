import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../auth/auth.service';

interface HomeStatBlock {
  totalUsers: number;
  totalNews: number;
  totalQuizzes: number;
  totalItems: number;
}

interface HomeNewsItem {
  id: number;
  title: string;
  summary: string;
  category: string;
  author: string;
  publishedAt: string;
  imageData: string;
}

interface HomeMarketItem {
  id: number;
  title: string;
  description: string;
  price: number;
  categoryName: string;
  seller: string;
  whatsapp: string;
  email: string;
  imageData: string;
}

interface MarketplaceApiItem {
  id: number;
  title: string;
  desc: string;
  cat: 'juego' | 'accesorio' | 'consola';
  price: number;
  emoji: string;
  seller: string;
  wa: string;
  mail: string;
  imageData?: string;
}

interface HomeRankingItem {
  position: number;
  gamertag: string;
  quizzesPlayed: number;
  totalScore: number;
}

interface HomeQuizItem {
  id: number;
  title: string;
  description: string;
  icon: string;
  difficulty: 'easy' | 'mid' | 'hard';
  timePerQuestion: number;
}

interface HomeResponse {
  stats: HomeStatBlock;
  featuredNews: HomeNewsItem | null;
  latestNews: HomeNewsItem[];
  marketplacePreview: HomeMarketItem[];
  quizPreview: HomeQuizItem[];
  ranking: HomeRankingItem[];
}

@Component({
  selector: 'app-index',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './index.component.html',
  styleUrls: ['./index.component.css'],
})
export class IndexComponent implements OnInit, OnDestroy {
  stats: HomeStatBlock = {
    totalUsers: 0,
    totalNews: 0,
    totalQuizzes: 0,
    totalItems: 0,
  };

  featuredNews: HomeNewsItem | null = null;
  latestNews: HomeNewsItem[] = [];
  marketplacePreview: HomeMarketItem[] = [];
  quizPreview: HomeQuizItem[] = [];
  ranking: HomeRankingItem[] = [];
  loading = true;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly http: HttpClient,
    private readonly cdr: ChangeDetectorRef,
    private readonly router: Router,
    readonly authService: AuthService,
  ) {}

  ngOnInit(): void {
    this.loadHomeData();
    this.refreshTimer = setInterval(() => this.loadHomeData(false), 5000);
  }

  ngOnDestroy(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }
  }

  logout(): void {
    this.authService.clearUser();
    this.cdr.detectChanges();
  }

  openPublishMarketplace(): void {
    this.router.navigate(['/marketplace'], {
      queryParams: { view: 'publish' },
    });
  }

  private loadHomeData(markLoading = true): void {
    if (markLoading) {
      this.loading = true;
    }

    this.http.get<HomeResponse>('/api/home', { transferCache: false }).subscribe({
      next: (response) => {
        this.stats = response.stats;
        this.featuredNews = response.featuredNews;
        this.latestNews = response.latestNews;
        this.quizPreview = response.quizPreview;
        this.marketplacePreview = response.marketplacePreview;
        this.ranking = response.ranking.slice(0, 5);
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('Error loading home data:', error);
        this.featuredNews = null;
        this.latestNews = [];
        this.quizPreview = [];
        this.marketplacePreview = [];
        this.ranking = [];
        this.loading = false;
        this.cdr.detectChanges();
      },
    });
  }
}
