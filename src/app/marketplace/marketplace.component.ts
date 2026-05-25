import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { AuthService } from '../auth/auth.service';

interface Item {
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

interface NewItemForm {
  title: string;
  desc: string;
  cat: Item['cat'];
  price: number | null;
  seller: string;
  wa: string;
  mail: string;
  emoji: string;
  imageData: string;
}

@Component({
  selector: 'app-marketplace',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './marketplace.component.html',
  styleUrls: ['./marketplace.component.css'],
})
export class MarketplaceComponent implements OnInit, OnDestroy {
  items: Item[] = [];
  filteredItems: Item[] = [];
  searchTerm = '';
  selectedCategory = '';
  currentView: 'market' | 'publish' = 'market';
  publishSuccess = '';
  publishError = '';
  loading = true;
  newItem: NewItemForm = this.createEmptyForm();
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private requestedView: 'market' | 'publish' = 'market';

  constructor(
    private readonly http: HttpClient,
    private readonly cdr: ChangeDetectorRef,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly authService: AuthService,
  ) {}

  ngOnInit(): void {
    this.route.queryParamMap.subscribe((params) => {
      this.requestedView = params.get('view') === 'publish' ? 'publish' : 'market';
      this.applyRequestedView();
      this.cdr.detectChanges();
    });

    this.loadItems();
    this.refreshTimer = setInterval(() => this.loadItems(false), 5000);
  }

  ngOnDestroy(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }
  }

  setView(view: 'market' | 'publish'): void {
    if (view === 'publish' && !this.authService.isLoggedIn()) {
      this.router.navigate(['/acceso-requerido'], {
        queryParams: {
          returnUrl: '/marketplace?view=publish',
          feature: 'marketplace',
        },
      });
      return;
    }

    this.currentView = view;
    this.publishSuccess = '';
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { view: view === 'publish' ? 'publish' : null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  filterItems(): void {
    const normalizedSearch = this.searchTerm.trim().toLowerCase();

    this.filteredItems = this.items.filter((item) => {
      const matchesSearch =
        !normalizedSearch ||
        item.title.toLowerCase().includes(normalizedSearch) ||
        item.desc.toLowerCase().includes(normalizedSearch) ||
        item.seller.toLowerCase().includes(normalizedSearch);

      const matchesCategory = !this.selectedCategory || item.cat === this.selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }

  publishItem(): void {
    this.publishError = '';

    if (
      !this.newItem.title.trim() ||
      !this.newItem.desc.trim() ||
      !this.newItem.seller.trim() ||
      !this.newItem.mail.trim() ||
      !this.newItem.cat ||
      this.newItem.price === null ||
      this.newItem.price <= 0
    ) {
      this.publishError = 'Completa los campos obligatorios antes de publicar.';
      return;
    }

    this.http.post<{ message: string }>('/api/marketplace/items', this.newItem).subscribe({
      next: (response) => {
        this.publishSuccess = response.message;
        this.newItem = this.createEmptyForm();
        this.currentView = 'market';
        this.searchTerm = '';
        this.selectedCategory = '';
        this.loadItems();
        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('Error publishing item:', error);
        this.publishError = error.error?.message || 'No se pudo publicar el articulo.';
        this.cdr.detectChanges();
      },
    });
  }

  getCategoryLabel(cat: Item['cat']): string {
    if (cat === 'consola') {
      return 'Consola';
    }

    if (cat === 'accesorio') {
      return 'Accesorio';
    }

    return 'Juego';
  }

  onImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      this.newItem.imageData = typeof reader.result === 'string' ? reader.result : '';
    };
    reader.readAsDataURL(file);
  }

  clearSelectedImage(): void {
    this.newItem.imageData = '';
  }

  private loadItems(markLoading = true): void {
    if (markLoading) {
      this.loading = true;
    }

    this.http.get<Item[]>('/api/marketplace/items', { transferCache: false }).subscribe({
      next: (items) => {
        this.items = items;
        this.filterItems();
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('Error loading marketplace items:', error);
        this.items = [];
        this.filteredItems = [];
        this.loading = false;
        this.cdr.detectChanges();
      },
    });
  }

  private createEmptyForm(): NewItemForm {
    return {
      title: '',
      desc: '',
      cat: 'juego',
      price: null,
      seller: '',
      wa: '',
      mail: '',
      emoji: '',
      imageData: '',
    };
  }

  private applyRequestedView(): void {
    if (this.requestedView === 'publish') {
      if (!this.authService.isLoggedIn()) {
        this.router.navigate(['/acceso-requerido'], {
          queryParams: {
            returnUrl: '/marketplace?view=publish',
            feature: 'marketplace',
          },
        });
        return;
      }

      this.currentView = 'publish';
      this.publishSuccess = '';
      return;
    }

    this.currentView = 'market';
  }
}
