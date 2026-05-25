import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { AuthService } from '../auth/auth.service';

interface Question {
  q: string;
  opts: string[];
  correct: number;
  hint?: string;
}

interface Quiz {
  id: number;
  title: string;
  description: string;
  icon: string;
  difficulty: 'easy' | 'mid' | 'hard';
  questions: Question[];
  timePerQuestion: number;
}

interface RankingPlayer {
  position: number;
  gamertag: string;
  quizzesPlayed: number;
  totalScore: number;
}

interface SaveAttemptResponse {
  message: string;
  ranking: RankingPlayer[];
}

@Component({
  selector: 'app-quiz',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './quiz.component.html',
  styleUrls: ['./quiz.component.css'],
})
export class QuizComponent implements OnInit, OnDestroy {
  quizzes: Quiz[] = [];
  ranking: RankingPlayer[] = [];
  selectedQuiz: Quiz | null = null;
  questions: Question[] = [];
  current = 0;
  score = 0;
  correct = 0;
  wrong = 0;
  timerInterval: any;
  timeLeft = 30;
  showLobby = true;
  showQuizSelection = false;
  showGame = false;
  showResults = false;
  selectedAnswer: number | null = null;
  answeredQuestions = new Set<number>();
  isAnswering = false;
  loading = true;
  savingResult = false;
  saveMessage = '';
  saveError = '';
  private requestedView: 'lobby' | 'selection' = 'lobby';

  constructor(
    private readonly http: HttpClient,
    private readonly cdr: ChangeDetectorRef,
    private readonly route: ActivatedRoute,
    private readonly authService: AuthService,
  ) {}

  ngOnInit(): void {
    this.route.queryParamMap.subscribe((params) => {
      this.requestedView = params.get('view') === 'selection' ? 'selection' : 'lobby';
      if (!this.loading) {
        this.applyRequestedView();
        this.cdr.detectChanges();
      }
    });

    this.loadQuizData();
  }

  ngOnDestroy(): void {
    clearInterval(this.timerInterval);
  }

  startQuizSelection(): void {
    if (!this.quizzes.length) {
      return;
    }

    this.showLobby = false;
    this.showQuizSelection = true;
  }

  selectQuizAndStart(quiz: Quiz): void {
    clearInterval(this.timerInterval);
    this.selectedQuiz = quiz;
    this.questions = quiz.questions;
    this.showQuizSelection = false;
    this.showGame = true;
    this.showResults = false;
    this.current = 0;
    this.score = 0;
    this.correct = 0;
    this.wrong = 0;
    this.answeredQuestions.clear();
    this.selectedAnswer = null;
    this.loadQuestion();
  }

  loadQuestion(): void {
    if (this.current >= this.questions.length) {
      this.displayResults();
      return;
    }

    this.timeLeft = this.selectedQuiz?.timePerQuestion || 30;
    this.selectedAnswer = null;
    this.isAnswering = false;
    this.startTimer();
  }

  startTimer(): void {
    clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      this.timeLeft--;
      if (this.timeLeft <= 0) {
        clearInterval(this.timerInterval);
        this.autoFail();
        return;
      }
      this.cdr.detectChanges();
    }, 1000);
    this.cdr.detectChanges();
  }

  autoFail(): void {
    this.wrong++;
    this.answeredQuestions.add(this.current);
    this.nextQuestion();
  }

  selectAnswer(i: number): void {
    if (this.isAnswering) {
      return;
    }

    this.isAnswering = true;
    this.selectedAnswer = i;
    clearInterval(this.timerInterval);

    if (i === this.questions[this.current].correct) {
      this.score += this.timeLeft * 10 + 100;
      this.correct++;
    } else {
      this.wrong++;
    }

    this.answeredQuestions.add(this.current);

    setTimeout(() => {
      this.isAnswering = false;
      this.nextQuestion();
      this.cdr.detectChanges();
    }, 1500);

    this.cdr.detectChanges();
  }

  nextQuestion(): void {
    this.current++;
    this.loadQuestion();
  }

  displayResults(): void {
    this.showGame = false;
    this.showResults = true;
    clearInterval(this.timerInterval);
    this.saveQuizAttempt();
    this.cdr.detectChanges();
  }

  resetQuiz(): void {
    this.showResults = false;
    this.showLobby = true;
    this.showQuizSelection = false;
    this.selectedQuiz = null;
    this.current = 0;
    this.score = 0;
    this.correct = 0;
    this.wrong = 0;
    this.selectedAnswer = null;
    this.isAnswering = false;
    this.answeredQuestions.clear();
    this.savingResult = false;
    this.saveMessage = '';
    this.saveError = '';
    clearInterval(this.timerInterval);
  }

  backToSelection(): void {
    this.showGame = false;
    this.showResults = false;
    this.showQuizSelection = true;
    this.selectedQuiz = null;
    this.current = 0;
    this.score = 0;
    this.correct = 0;
    this.wrong = 0;
    this.selectedAnswer = null;
    this.isAnswering = false;
    this.answeredQuestions.clear();
    this.savingResult = false;
    this.saveMessage = '';
    this.saveError = '';
    clearInterval(this.timerInterval);
    this.cdr.detectChanges();
  }

  getResultMessage(): string {
    const percentage = this.questions.length ? (this.correct / this.questions.length) * 100 : 0;
    if (percentage === 100) return 'PERFECTO';
    if (percentage >= 80) return 'EXCELENTE';
    if (percentage >= 60) return 'BIEN HECHO';
    if (percentage >= 40) return 'NO ESTA MAL';
    return 'SIGUE PRACTICANDO';
  }

  private loadQuizData(): void {
    this.loading = true;

    this.http.get<Quiz[]>('/api/quizzes', { transferCache: false }).subscribe({
      next: (quizzes) => {
        this.quizzes = quizzes;
        this.loading = false;
        this.applyRequestedView();
        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('Error loading quizzes:', error);
        this.quizzes = [];
        this.loading = false;
        this.cdr.detectChanges();
      },
    });

    this.http.get<RankingPlayer[]>('/api/ranking', { transferCache: false }).subscribe({
      next: (ranking) => {
        this.ranking = ranking;
        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('Error loading ranking:', error);
        this.ranking = [];
        this.cdr.detectChanges();
      },
    });
  }

  private applyRequestedView(): void {
    if (this.requestedView === 'selection' && this.quizzes.length) {
      this.showLobby = false;
      this.showQuizSelection = true;
      this.showGame = false;
      this.showResults = false;
      return;
    }

    this.showLobby = true;
    this.showQuizSelection = false;
  }

  private saveQuizAttempt(): void {
    const currentUser = this.authService.currentUser();

    if (!currentUser || !this.selectedQuiz || this.savingResult) {
      return;
    }

    this.savingResult = true;
    this.saveMessage = '';
    this.saveError = '';

    this.http
      .post<SaveAttemptResponse>('/api/quizzes/attempts', {
        userId: currentUser.id,
        quizId: this.selectedQuiz.id,
        score: this.score,
        correctAnswers: this.correct,
        wrongAnswers: this.wrong,
        totalQuestions: this.questions.length,
      })
      .subscribe({
        next: (response) => {
          this.ranking = response.ranking;
          this.saveMessage = response.message;
          this.savingResult = false;
          this.cdr.detectChanges();
        },
        error: (error) => {
          console.error('Error saving quiz attempt:', error);
          this.saveError = error.error?.message || 'No se pudo actualizar el ranking.';
          this.savingResult = false;
          this.cdr.detectChanges();
        },
      });
  }
}
