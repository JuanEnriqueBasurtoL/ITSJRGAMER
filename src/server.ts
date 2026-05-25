import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { join } from 'node:path';
import mysql from 'mysql2/promise';
import {
  dataUrlToBuffer,
  dbConfig,
  ensureCareer,
  ensureRole,
  hashPassword,
  pool,
  slugify,
  toDataUrl,
  verifyPassword,
} from './db/mysql';

const browserDistFolder = join(import.meta.dirname, '../browser');

const app = express();
const angularApp = new AngularNodeAppEngine();

app.use(express.json({ limit: '15mb' }));
app.use('/api', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  next();
});

function mapMarketplaceCategoryToSlug(category: string): string {
  if (category === 'consola') {
    return 'consolas';
  }

  if (category === 'accesorio') {
    return 'accesorios';
  }

  return 'juegos';
}

function mapCategorySlugToUiCategory(categorySlug: string): 'juego' | 'accesorio' | 'consola' {
  if (categorySlug === 'consolas') {
    return 'consola';
  }

  if (categorySlug === 'accesorios') {
    return 'accesorio';
  }

  return 'juego';
}

async function loadRanking(limit: number): Promise<
  Array<{
    position: number;
    gamertag: string;
    quizzesPlayed: number;
    totalScore: number;
  }>
> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT
       u.username AS gamertag,
       COUNT(qa.attempt_id) AS quizzes_played,
       COALESCE(SUM(qa.score), 0) AS total_score
     FROM quiz_attempts qa
     INNER JOIN users u ON u.user_id = qa.user_id
     GROUP BY u.user_id, u.username
     ORDER BY total_score DESC, quizzes_played DESC, u.username ASC
     LIMIT ?`,
    [limit],
  );

  return rows.map((row, index) => ({
    position: index + 1,
    gamertag: row['gamertag'],
    quizzesPlayed: Number(row['quizzes_played'] || 0),
    totalScore: Number(row['total_score'] || 0),
  }));
}

async function loadAdminUsers() {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT
       u.user_id,
       u.first_name,
       u.last_name,
       u.username,
       u.email,
       u.account_status,
       r.role_name,
       c.career_name,
       u.created_at
     FROM users u
     INNER JOIN roles r ON r.role_id = u.role_id
     LEFT JOIN careers c ON c.career_id = u.career_id
     WHERE u.account_status <> 'deleted'
     ORDER BY u.created_at DESC`,
  );

  return rows.map((row) => ({
    id: Number(row['user_id']),
    firstName: row['first_name'] || '',
    lastName: row['last_name'] || '',
    gamertag: row['username'],
    email: row['email'],
    status: row['account_status'],
    roleName: row['role_name'],
    career: row['career_name'] || '',
    createdAt: row['created_at'],
  }));
}

async function loadAdminQuizzes() {
  const [quizRows] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT quiz_id, title, description, icon, difficulty, time_per_question, is_active
     FROM quizzes
     ORDER BY created_at ASC`,
  );

  const [questionRows] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT question_id, quiz_id, question_text, hint_text, question_order
     FROM quiz_questions
     ORDER BY quiz_id ASC, question_order ASC`,
  );

  const [optionRows] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT question_id, option_text, option_order, is_correct
     FROM quiz_question_options
     ORDER BY question_id ASC, option_order ASC`,
  );

  const optionsByQuestion = new Map<number, mysql.RowDataPacket[]>();
  for (const option of optionRows) {
    const questionId = Number(option['question_id']);
    const current = optionsByQuestion.get(questionId) || [];
    current.push(option);
    optionsByQuestion.set(questionId, current);
  }

  const questionsByQuiz = new Map<number, any[]>();
  for (const question of questionRows) {
    const questionId = Number(question['question_id']);
    const optionList = optionsByQuestion.get(questionId) || [];
    const current = questionsByQuiz.get(Number(question['quiz_id'])) || [];

    current.push({
      text: question['question_text'],
      hint: question['hint_text'] || '',
      correct: Math.max(0, optionList.findIndex((option) => Number(option['is_correct']) === 1)),
      options: optionList.map((option) => option['option_text']),
    });

    questionsByQuiz.set(Number(question['quiz_id']), current);
  }

  return quizRows.map((quiz) => ({
    id: Number(quiz['quiz_id']),
    title: quiz['title'],
    description: quiz['description'] || '',
    icon: quiz['icon'] || 'GG',
    difficulty: quiz['difficulty'],
    timePerQuestion: Number(quiz['time_per_question']),
    isActive: Number(quiz['is_active']) === 1,
    questions: questionsByQuiz.get(Number(quiz['quiz_id'])) || [],
  }));
}

async function loadAdminProducts() {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT
       mi.item_id,
       mi.title,
       mi.price,
       mi.status,
       mc.category_name,
       u.username AS seller_name,
       mi.created_at
     FROM marketplace_items mi
     INNER JOIN marketplace_categories mc ON mc.marketplace_category_id = mi.marketplace_category_id
     INNER JOIN users u ON u.user_id = mi.seller_user_id
     ORDER BY mi.created_at DESC`,
  );

  return rows.map((row) => ({
    id: Number(row['item_id']),
    title: row['title'],
    price: Number(row['price']),
    status: row['status'],
    category: row['category_name'],
    seller: row['seller_name'],
    createdAt: row['created_at'],
  }));
}

async function loadAdminNews() {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT
       n.news_id,
       n.title,
       n.summary,
       n.category,
       n.status,
       u.username AS author_name,
       n.created_at
     FROM news_posts n
     INNER JOIN users u ON u.user_id = n.author_user_id
     ORDER BY n.created_at DESC`,
  );

  return rows.map((row) => ({
    id: Number(row['news_id']),
    title: row['title'],
    summary: row['summary'] || '',
    category: row['category'] || 'Noticia',
    status: row['status'],
    author: row['author_name'],
    createdAt: row['created_at'],
  }));
}

async function loadAdminMetrics() {
  const [overviewRows] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT
       (SELECT COUNT(*) FROM users WHERE account_status = 'suspended') AS suspendedUsers,
       (SELECT COUNT(*) FROM quizzes WHERE is_active = 1) AS activeQuizzes,
       (SELECT COUNT(*) FROM news_posts WHERE status = 'published') AS publishedNews,
       (SELECT COUNT(*) FROM quiz_attempts) AS totalQuizAttempts`,
  );

  const [userStatusRows] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT account_status AS label, COUNT(*) AS total
     FROM users
     WHERE account_status <> 'deleted'
     GROUP BY account_status
     ORDER BY account_status ASC`,
  );

  const [quizActivityRows] = await pool.query<mysql.RowDataPacket[]>(
    `WITH RECURSIVE days AS (
       SELECT CURDATE() - INTERVAL 6 DAY AS day_date
       UNION ALL
       SELECT day_date + INTERVAL 1 DAY
       FROM days
       WHERE day_date < CURDATE()
     )
     SELECT
       DATE_FORMAT(days.day_date, '%a') AS dayLabel,
       (
         SELECT COUNT(*)
         FROM quiz_attempts qa
         WHERE DATE(qa.created_at) = days.day_date
       ) AS total
     FROM days`,
  );

  const [moduleRows] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT 'Usuarios' AS label, COUNT(*) AS total FROM users WHERE account_status <> 'deleted'
     UNION ALL
     SELECT 'Noticias' AS label, COUNT(*) AS total FROM news_posts WHERE status = 'published'
     UNION ALL
     SELECT 'Quizzes' AS label, COUNT(*) AS total FROM quizzes WHERE is_active = 1
     UNION ALL
     SELECT 'Articulos' AS label, COUNT(*) AS total FROM marketplace_items WHERE status = 'published'`,
  );

  const overview = overviewRows[0] || {
    suspendedUsers: 0,
    activeQuizzes: 0,
    publishedNews: 0,
    totalQuizAttempts: 0,
  };

  return {
    overview: {
      suspendedUsers: Number(overview['suspendedUsers'] || 0),
      activeQuizzes: Number(overview['activeQuizzes'] || 0),
      publishedNews: Number(overview['publishedNews'] || 0),
      totalQuizAttempts: Number(overview['totalQuizAttempts'] || 0),
    },
    userStatusChart: {
      labels: userStatusRows.map((row) => row['label']),
      values: userStatusRows.map((row) => Number(row['total'] || 0)),
    },
    quizActivityChart: {
      labels: quizActivityRows.map((row) => row['dayLabel']),
      values: quizActivityRows.map((row) => Number(row['total'] || 0)),
    },
    moduleChart: {
      labels: moduleRows.map((row) => row['label']),
      values: moduleRows.map((row) => Number(row['total'] || 0)),
    },
  };
}

async function ensureMarketplaceCategory(categorySlug: string): Promise<number> {
  const [existingRows] = await pool.query<mysql.RowDataPacket[]>(
    'SELECT marketplace_category_id FROM marketplace_categories WHERE category_slug = ? LIMIT 1',
    [categorySlug],
  );

  if (existingRows.length) {
    return Number(existingRows[0]['marketplace_category_id']);
  }

  const categoryName =
    categorySlug === 'consolas' ? 'Consolas' : categorySlug === 'accesorios' ? 'Accesorios' : 'Juegos';

  const [result] = await pool.query<mysql.ResultSetHeader>(
    `INSERT INTO marketplace_categories (category_name, category_slug, category_description, is_active)
     VALUES (?, ?, ?, 1)`,
    [categoryName, categorySlug, `Categoria ${categoryName}`],
  );

  return Number(result.insertId);
}

async function ensureMarketplaceSeller(name: string, email: string, whatsapp: string): Promise<number> {
  const normalizedEmail = email.trim().toLowerCase();
  const [existingRows] = await pool.query<mysql.RowDataPacket[]>(
    'SELECT user_id FROM users WHERE email = ? LIMIT 1',
    [normalizedEmail],
  );

  if (existingRows.length) {
    return Number(existingRows[0]['user_id']);
  }

  const studentRoleId = await ensureRole('student');
  const usernameBase = slugify(name) || `gamer-${Date.now()}`;
  let username = usernameBase.slice(0, 40);
  let suffix = 1;

  while (true) {
    const [userRows] = await pool.query<mysql.RowDataPacket[]>(
      'SELECT user_id FROM users WHERE username = ? LIMIT 1',
      [username],
    );

    if (!userRows.length) {
      break;
    }

    username = `${usernameBase.slice(0, 35)}-${suffix++}`;
  }

  const passwordHash = await hashPassword(`temp-${Date.now()}`);

  const [result] = await pool.query<mysql.ResultSetHeader>(
    `INSERT INTO users
      (role_id, career_id, first_name, last_name, username, email, password_hash, phone, terms_accepted, email_verified, account_status)
     VALUES (?, NULL, ?, ?, ?, ?, ?, ?, 1, 1, 'active')`,
    [studentRoleId, name.trim(), 'Marketplace', username, normalizedEmail, passwordHash, whatsapp.trim() || null],
  );

  return Number(result.insertId);
}

app.get('/api/health', async (_req, res) => {
  try {
    const connection = await pool.getConnection();
    await connection.query('SELECT 1');
    connection.release();

    res.json({
      ok: true,
      database: dbConfig.database,
      host: dbConfig.host,
      port: dbConfig.port,
    });
  } catch (error) {
    console.error('Database health check failed:', error);
    res.status(500).json({ ok: false, message: 'No se pudo conectar a MySQL local.' });
  }
});

app.get('/api/home', async (_req, res) => {
  try {
    const [countRows] = await Promise.all([
      pool.query<mysql.RowDataPacket[]>(
        `SELECT
           (SELECT COUNT(*) FROM users WHERE account_status <> 'deleted') AS totalUsers,
           (SELECT COUNT(*) FROM news_posts WHERE status = 'published') AS totalNews,
           (SELECT COUNT(*) FROM quizzes WHERE is_active = 1) AS totalQuizzes,
           (SELECT COUNT(*) FROM marketplace_items WHERE status = 'published') AS totalItems`,
      ),
    ]);

    const counts = countRows[0][0] || {
      totalUsers: 0,
      totalNews: 0,
      totalQuizzes: 0,
      totalItems: 0,
    };

    const [newsRows] = await pool.query<mysql.RowDataPacket[]>(
      `SELECT
         n.news_id,
         n.title,
         n.summary,
         n.category,
         n.published_at,
         u.username AS author_name,
         ni.image_mime,
         ni.image_data
       FROM news_posts n
       INNER JOIN users u ON u.user_id = n.author_user_id
       LEFT JOIN news_images ni ON ni.news_id = n.news_id AND ni.is_cover = 1
       WHERE n.status = 'published'
       ORDER BY COALESCE(n.published_at, n.created_at) DESC
       LIMIT 5`,
    );

    const [marketRows] = await pool.query<mysql.RowDataPacket[]>(
      `SELECT
         mi.item_id,
         mi.title,
         mi.description,
         mi.price,
         mi.contact_whatsapp,
         mi.contact_email,
         mc.category_name,
         mc.category_slug,
         u.username AS seller_name,
         img.image_mime,
         img.image_data
       FROM marketplace_items mi
       INNER JOIN marketplace_categories mc ON mc.marketplace_category_id = mi.marketplace_category_id
       INNER JOIN users u ON u.user_id = mi.seller_user_id
       LEFT JOIN marketplace_item_images img ON img.item_id = mi.item_id AND img.is_primary = 1
       WHERE mi.status = 'published'
       ORDER BY COALESCE(mi.published_at, mi.created_at) DESC
       LIMIT 4`,
    );

    const rankingRows = await loadRanking(5);

    const [quizPreviewRows] = await pool.query<mysql.RowDataPacket[]>(
      `SELECT
         quiz_id,
         title,
         description,
         icon,
         difficulty,
         time_per_question
       FROM quizzes
       WHERE is_active = 1
       ORDER BY created_at ASC
       LIMIT 3`,
    );

    const featuredNewsRow = newsRows[0];

    const featuredNews = newsRows.length
      ? {
          id: Number(featuredNewsRow['news_id']),
          title: featuredNewsRow['title'],
          summary: featuredNewsRow['summary'] || '',
          category: featuredNewsRow['category'] || 'Noticia',
          author: featuredNewsRow['author_name'],
          publishedAt: featuredNewsRow['published_at'],
          imageData: toDataUrl(featuredNewsRow['image_mime'], featuredNewsRow['image_data']) || '',
        }
      : null;

    res.json({
      stats: {
        totalUsers: Number(counts['totalUsers'] || 0),
        totalNews: Number(counts['totalNews'] || 0),
        totalQuizzes: Number(counts['totalQuizzes'] || 0),
        totalItems: Number(counts['totalItems'] || 0),
      },
      featuredNews,
      latestNews: newsRows.slice(1).map((row) => ({
        id: Number(row['news_id']),
        title: row['title'],
        category: row['category'] || 'Noticia',
        summary: row['summary'] || '',
        author: row['author_name'],
        publishedAt: row['published_at'],
      })),
      marketplacePreview: marketRows.map((row) => ({
        id: Number(row['item_id']),
        title: row['title'],
        description: row['description'],
        price: Number(row['price']),
        categoryName: row['category_name'],
        categorySlug: row['category_slug'],
        seller: row['seller_name'],
        whatsapp: row['contact_whatsapp'] || '',
        email: row['contact_email'] || '',
        imageData: toDataUrl(row['image_mime'], row['image_data']) || '',
      })),
      quizPreview: quizPreviewRows.map((row) => ({
        id: Number(row['quiz_id']),
        title: row['title'],
        description: row['description'] || '',
        icon: row['icon'] || 'GG',
        difficulty: row['difficulty'],
        timePerQuestion: Number(row['time_per_question']),
      })),
      ranking: rankingRows,
    });
  } catch (error) {
    console.error('Error loading home data:', error);
    res.status(500).json({ message: 'No se pudieron cargar los datos del inicio.' });
  }
});

app.get('/api/home/stats', async (_req, res) => {
  try {
    const [rows] = await pool.query<mysql.RowDataPacket[]>(
      `SELECT
         (SELECT COUNT(*) FROM users WHERE account_status <> 'deleted') AS totalUsers,
         (SELECT COUNT(*) FROM news_posts WHERE status = 'published') AS totalNews,
         (SELECT COUNT(*) FROM quizzes WHERE is_active = 1) AS totalQuizzes,
         (SELECT COUNT(*) FROM marketplace_items WHERE status = 'published') AS totalItems`,
    );

    const stats = rows[0] || {
      totalUsers: 0,
      totalNews: 0,
      totalQuizzes: 0,
      totalItems: 0,
    };

    res.json({
      totalUsers: Number(stats['totalUsers'] || 0),
      totalNews: Number(stats['totalNews'] || 0),
      totalQuizzes: Number(stats['totalQuizzes'] || 0),
      totalItems: Number(stats['totalItems'] || 0),
    });
  } catch (error) {
    console.error('Error loading home stats:', error);
    res.status(500).json({ message: 'No se pudieron cargar las estadisticas.' });
  }
});

app.get('/api/marketplace/items', async (_req, res) => {
  try {
    const [rows] = await pool.query<mysql.RowDataPacket[]>(
      `SELECT
         mi.item_id,
         mi.title,
         mi.description,
         mi.short_code,
         mi.price,
         mi.contact_whatsapp,
         mi.contact_email,
         mc.category_name,
         mc.category_slug,
         u.username AS seller_name,
         img.image_mime,
         img.image_data
       FROM marketplace_items mi
       INNER JOIN marketplace_categories mc ON mc.marketplace_category_id = mi.marketplace_category_id
       INNER JOIN users u ON u.user_id = mi.seller_user_id
       LEFT JOIN marketplace_item_images img ON img.item_id = mi.item_id AND img.is_primary = 1
       WHERE mi.status = 'published'
       ORDER BY COALESCE(mi.published_at, mi.created_at) DESC`,
    );

    res.json(
      rows.map((row) => ({
        id: Number(row['item_id']),
        title: row['title'],
        desc: row['description'],
        cat: mapCategorySlugToUiCategory(row['category_slug']),
        price: Number(row['price']),
        emoji: row['short_code'] || 'GG',
        seller: row['seller_name'],
        wa: row['contact_whatsapp'] || '',
        mail: row['contact_email'] || '',
        imageData: toDataUrl(row['image_mime'], row['image_data']) || '',
      })),
    );
  } catch (error) {
    console.error('Error loading marketplace items:', error);
    res.status(500).json({ message: 'No se pudo cargar el marketplace.' });
  }
});

app.post('/api/marketplace/items', async (req, res) => {
  const { title, desc, cat, price, seller, wa, mail, emoji, imageData } = req.body ?? {};

  if (!title || !desc || !cat || !price || !seller || !mail) {
    res.status(400).json({ message: 'Faltan campos obligatorios para publicar el articulo.' });
    return;
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const sellerUserId = await ensureMarketplaceSeller(String(seller), String(mail), String(wa || ''));
    const categorySlug = mapMarketplaceCategoryToSlug(String(cat));
    const categoryId = await ensureMarketplaceCategory(categorySlug);

    const [itemResult] = await connection.query<mysql.ResultSetHeader>(
      `INSERT INTO marketplace_items
        (seller_user_id, marketplace_category_id, title, description, short_code, price, currency_code, contact_whatsapp, contact_email, stock_quantity, condition_label, status, published_at)
       VALUES (?, ?, ?, ?, ?, ?, 'MXN', ?, ?, 1, 'used', 'published', NOW())`,
      [
        sellerUserId,
        categoryId,
        String(title).trim(),
        String(desc).trim(),
        String(emoji || '').trim().slice(0, 10) || null,
        Number(price),
        String(wa || '').trim() || null,
        String(mail).trim().toLowerCase(),
      ],
    );

    const itemId = Number(itemResult.insertId);

    if (imageData) {
      const parsedImage = dataUrlToBuffer(String(imageData));

      if (parsedImage) {
        await connection.query(
          `INSERT INTO marketplace_item_images
            (item_id, image_name, image_mime, image_data, alt_text, is_primary, sort_order)
           VALUES (?, ?, ?, ?, ?, 1, 1)`,
          [itemId, `${slugify(String(title)) || 'articulo'}.jpg`, parsedImage.mimeType, parsedImage.buffer, String(title)],
        );
      }
    }

    await connection.commit();
    res.status(201).json({ message: 'Articulo publicado correctamente.' });
  } catch (error) {
    await connection.rollback();
    console.error('Error publishing marketplace item:', error);
    res.status(500).json({ message: 'No se pudo publicar el articulo.' });
  } finally {
    connection.release();
  }
});

app.get('/api/quizzes', async (_req, res) => {
  try {
    const [quizRows] = await pool.query<mysql.RowDataPacket[]>(
      `SELECT quiz_id, title, description, icon, difficulty, time_per_question
       FROM quizzes
       WHERE is_active = 1
       ORDER BY created_at ASC`,
    );

    const [questionRows] = await pool.query<mysql.RowDataPacket[]>(
      `SELECT question_id, quiz_id, question_text, hint_text, question_order
       FROM quiz_questions
       ORDER BY quiz_id ASC, question_order ASC`,
    );

    const [optionRows] = await pool.query<mysql.RowDataPacket[]>(
      `SELECT option_id, question_id, option_text, option_order, is_correct
       FROM quiz_question_options
       ORDER BY question_id ASC, option_order ASC`,
    );

    const optionsByQuestion = new Map<number, mysql.RowDataPacket[]>();
    for (const option of optionRows) {
      const questionId = Number(option['question_id']);
      const current = optionsByQuestion.get(questionId) || [];
      current.push(option);
      optionsByQuestion.set(questionId, current);
    }

    const questionsByQuiz = new Map<number, any[]>();
    for (const question of questionRows) {
      const questionId = Number(question['question_id']);
      const optionList = optionsByQuestion.get(questionId) || [];
      const correctIndex = optionList.findIndex((option) => Number(option['is_correct']) === 1);
      const current = questionsByQuiz.get(Number(question['quiz_id'])) || [];

      current.push({
        q: question['question_text'],
        opts: optionList.map((option) => option['option_text']),
        correct: correctIndex >= 0 ? correctIndex : 0,
        hint: question['hint_text'] || undefined,
      });

      questionsByQuiz.set(Number(question['quiz_id']), current);
    }

    res.json(
      quizRows.map((quiz) => ({
        id: Number(quiz['quiz_id']),
        title: quiz['title'],
        description: quiz['description'] || '',
        icon: quiz['icon'] || 'GG',
        difficulty: quiz['difficulty'],
        timePerQuestion: Number(quiz['time_per_question']),
        questions: questionsByQuiz.get(Number(quiz['quiz_id'])) || [],
      })),
    );
  } catch (error) {
    console.error('Error loading quizzes:', error);
    res.status(500).json({ message: 'No se pudieron cargar los quizzes.' });
  }
});

app.get('/api/ranking', async (_req, res) => {
  try {
    res.json(await loadRanking(10));
  } catch (error) {
    console.error('Error loading ranking:', error);
    res.status(500).json({ message: 'No se pudo cargar el ranking.' });
  }
});

app.post('/api/quizzes/attempts', async (req, res) => {
  const { userId, quizId, score, correctAnswers, wrongAnswers, totalQuestions } = req.body ?? {};

  if (!userId || !quizId || totalQuestions === undefined) {
    res.status(400).json({ message: 'Faltan datos para guardar el resultado del quiz.' });
    return;
  }

  const normalizedScore = Math.max(0, Number(score) || 0);
  const normalizedCorrect = Math.max(0, Number(correctAnswers) || 0);
  const normalizedWrong = Math.max(0, Number(wrongAnswers) || 0);
  const normalizedTotal = Math.max(0, Number(totalQuestions) || 0);
  const accuracyPercentage =
    normalizedTotal > 0 ? Number(((normalizedCorrect / normalizedTotal) * 100).toFixed(2)) : 0;

  try {
    const [userRows] = await pool.query<mysql.RowDataPacket[]>(
      `SELECT user_id
       FROM users
       WHERE user_id = ? AND account_status = 'active'
       LIMIT 1`,
      [Number(userId)],
    );

    if (!userRows.length) {
      res.status(404).json({ message: 'No encontramos al jugador para guardar su puntaje.' });
      return;
    }

    const [quizRows] = await pool.query<mysql.RowDataPacket[]>(
      `SELECT quiz_id
       FROM quizzes
       WHERE quiz_id = ? AND is_active = 1
       LIMIT 1`,
      [Number(quizId)],
    );

    if (!quizRows.length) {
      res.status(404).json({ message: 'El quiz ya no esta disponible.' });
      return;
    }

    const [existingRows] = await pool.query<mysql.RowDataPacket[]>(
      `SELECT attempt_id
       FROM quiz_attempts
       WHERE user_id = ? AND quiz_id = ?
       LIMIT 1`,
      [Number(userId), Number(quizId)],
    );

    if (existingRows.length) {
      await pool.query(
        `UPDATE quiz_attempts
         SET score = ?,
             correct_answers = ?,
             wrong_answers = ?,
             total_questions = ?,
             accuracy_percentage = ?,
             started_at = NOW(),
             finished_at = NOW()
         WHERE attempt_id = ?`,
        [
          normalizedScore,
          normalizedCorrect,
          normalizedWrong,
          normalizedTotal,
          accuracyPercentage,
          Number(existingRows[0]['attempt_id']),
        ],
      );
    } else {
      await pool.query(
        `INSERT INTO quiz_attempts
          (user_id, quiz_id, score, correct_answers, wrong_answers, total_questions, accuracy_percentage, started_at, finished_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          Number(userId),
          Number(quizId),
          normalizedScore,
          normalizedCorrect,
          normalizedWrong,
          normalizedTotal,
          accuracyPercentage,
        ],
      );
    }

    res.status(201).json({
      message: 'Resultado del quiz guardado correctamente.',
      ranking: await loadRanking(10),
    });
  } catch (error) {
    console.error('Error saving quiz attempt:', error);
    res.status(500).json({ message: 'No se pudo guardar el resultado del quiz.' });
  }
});

app.get('/api/dashboard', async (_req, res) => {
  try {
    const [statsRows] = await pool.query<mysql.RowDataPacket[]>(
      `SELECT
         (SELECT COUNT(*) FROM users WHERE account_status <> 'deleted') AS totalUsers,
         (SELECT COALESCE(SUM(total_amount), 0) FROM orders WHERE order_status = 'completed') AS totalSales,
         (SELECT COUNT(*) FROM marketplace_items WHERE status = 'published') AS totalProducts,
         (SELECT COUNT(*) FROM orders) AS totalOrders`,
    );

    const [categoryRows] = await pool.query<mysql.RowDataPacket[]>(
      `SELECT mc.category_name AS label, COUNT(mi.item_id) AS total
       FROM marketplace_categories mc
       LEFT JOIN marketplace_items mi
         ON mi.marketplace_category_id = mc.marketplace_category_id
         AND mi.status = 'published'
       GROUP BY mc.marketplace_category_id, mc.category_name
       ORDER BY mc.category_name ASC`,
    );

    const [activityRows] = await pool.query<mysql.RowDataPacket[]>(
      `WITH RECURSIVE days AS (
         SELECT CURDATE() - INTERVAL 6 DAY AS day_date
         UNION ALL
         SELECT day_date + INTERVAL 1 DAY
         FROM days
         WHERE day_date < CURDATE()
       )
       SELECT
         DATE_FORMAT(days.day_date, '%a') AS dayLabel,
         (
           SELECT COUNT(*)
           FROM marketplace_items mi
           WHERE DATE(mi.created_at) = days.day_date
         ) +
         (
           SELECT COUNT(*)
           FROM users u
           WHERE DATE(u.created_at) = days.day_date
         ) +
         (
           SELECT COUNT(*)
           FROM orders o
           WHERE DATE(o.created_at) = days.day_date
         ) AS total
       FROM days`,
    );

    const stats = statsRows[0] || {
      totalUsers: 0,
      totalSales: 0,
      totalProducts: 0,
      totalOrders: 0,
    };

    const [users, quizzes, products, news, extraMetrics] = await Promise.all([
      loadAdminUsers(),
      loadAdminQuizzes(),
      loadAdminProducts(),
      loadAdminNews(),
      loadAdminMetrics(),
    ]);

    res.json({
      stats: {
        totalUsers: Number(stats['totalUsers'] || 0),
        totalSales: Number(stats['totalSales'] || 0),
        totalProducts: Number(stats['totalProducts'] || 0),
        totalOrders: Number(stats['totalOrders'] || 0),
      },
      categoryChart: {
        labels: categoryRows.map((row) => row['label']),
        values: categoryRows.map((row) => Number(row['total'] || 0)),
      },
      activityChart: {
        labels: activityRows.map((row) => row['dayLabel']),
        values: activityRows.map((row) => Number(row['total'] || 0)),
      },
      extraMetrics,
      users,
      quizzes,
      products,
      news,
    });
  } catch (error) {
    console.error('Error loading dashboard:', error);
    res.status(500).json({ message: 'No se pudo cargar el dashboard.' });
  }
});

app.patch('/api/admin/users/:id', async (req, res) => {
  const userId = Number(req.params['id']);
  const { firstName, lastName, gamertag, email, status } = req.body ?? {};

  if (!userId || !firstName || !lastName || !gamertag || !email || !status) {
    res.status(400).json({ message: 'Completa todos los datos del usuario.' });
    return;
  }

  try {
    const [duplicateRows] = await pool.query<mysql.RowDataPacket[]>(
      `SELECT user_id
       FROM users
       WHERE (email = ? OR username = ?) AND user_id <> ?
       LIMIT 1`,
      [String(email).trim().toLowerCase(), String(gamertag).trim(), userId],
    );

    if (duplicateRows.length) {
      res.status(409).json({ message: 'Ese correo o gamertag ya pertenece a otro usuario.' });
      return;
    }

    await pool.query(
      `UPDATE users
       SET first_name = ?, last_name = ?, username = ?, email = ?, account_status = ?
       WHERE user_id = ?`,
      [
        String(firstName).trim(),
        String(lastName).trim(),
        String(gamertag).trim(),
        String(email).trim().toLowerCase(),
        String(status),
        userId,
      ],
    );

    res.json({ message: 'Usuario actualizado correctamente.' });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ message: 'No se pudo actualizar el usuario.' });
  }
});

app.post('/api/admin/quizzes', async (req, res) => {
  const { adminUserId, title, description, icon, difficulty, timePerQuestion, questions } = req.body ?? {};

  if (!adminUserId || !title || !difficulty || !timePerQuestion || !Array.isArray(questions) || !questions.length) {
    res.status(400).json({ message: 'Completa los datos del quiz y agrega preguntas.' });
    return;
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [quizResult] = await connection.query<mysql.ResultSetHeader>(
      `INSERT INTO quizzes
        (created_by_user_id, title, description, icon, difficulty, time_per_question, is_active)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
      [
        Number(adminUserId),
        String(title).trim(),
        String(description || '').trim(),
        String(icon || 'GG').trim(),
        String(difficulty),
        Number(timePerQuestion),
      ],
    );

    const quizId = Number(quizResult.insertId);

    for (let questionIndex = 0; questionIndex < questions.length; questionIndex++) {
      const question = questions[questionIndex];
      const [questionResult] = await connection.query<mysql.ResultSetHeader>(
        `INSERT INTO quiz_questions (quiz_id, question_text, hint_text, question_order)
         VALUES (?, ?, ?, ?)`,
        [quizId, String(question.text).trim(), String(question.hint || '').trim() || null, questionIndex + 1],
      );

      const questionId = Number(questionResult.insertId);
      const options = Array.isArray(question.options) ? question.options : [];

      for (let optionIndex = 0; optionIndex < options.length; optionIndex++) {
        await connection.query(
          `INSERT INTO quiz_question_options (question_id, option_text, option_order, is_correct)
           VALUES (?, ?, ?, ?)`,
          [
            questionId,
            String(options[optionIndex]).trim(),
            optionIndex + 1,
            optionIndex === Number(question.correct) ? 1 : 0,
          ],
        );
      }
    }

    await connection.commit();
    res.status(201).json({ message: 'Quiz creado correctamente.' });
  } catch (error) {
    await connection.rollback();
    console.error('Error creating quiz:', error);
    res.status(500).json({ message: 'No se pudo crear el quiz.' });
  } finally {
    connection.release();
  }
});

app.put('/api/admin/quizzes/:id', async (req, res) => {
  const quizId = Number(req.params['id']);
  const { title, description, icon, difficulty, timePerQuestion, isActive, questions } = req.body ?? {};

  if (!quizId || !title || !difficulty || !timePerQuestion || !Array.isArray(questions) || !questions.length) {
    res.status(400).json({ message: 'Completa los datos del quiz para guardarlo.' });
    return;
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [questionIds] = await connection.query<mysql.RowDataPacket[]>(
      `SELECT question_id FROM quiz_questions WHERE quiz_id = ?`,
      [quizId],
    );

    if (questionIds.length) {
      await connection.query(
        `DELETE FROM quiz_question_options WHERE question_id IN (${questionIds.map(() => '?').join(',')})`,
        questionIds.map((row) => Number(row['question_id'])),
      );
    }

    await connection.query(`DELETE FROM quiz_questions WHERE quiz_id = ?`, [quizId]);

    await connection.query(
      `UPDATE quizzes
       SET title = ?, description = ?, icon = ?, difficulty = ?, time_per_question = ?, is_active = ?
       WHERE quiz_id = ?`,
      [
        String(title).trim(),
        String(description || '').trim(),
        String(icon || 'GG').trim(),
        String(difficulty),
        Number(timePerQuestion),
        isActive ? 1 : 0,
        quizId,
      ],
    );

    for (let questionIndex = 0; questionIndex < questions.length; questionIndex++) {
      const question = questions[questionIndex];
      const [questionResult] = await connection.query<mysql.ResultSetHeader>(
        `INSERT INTO quiz_questions (quiz_id, question_text, hint_text, question_order)
         VALUES (?, ?, ?, ?)`,
        [quizId, String(question.text).trim(), String(question.hint || '').trim() || null, questionIndex + 1],
      );

      const questionId = Number(questionResult.insertId);
      const options = Array.isArray(question.options) ? question.options : [];

      for (let optionIndex = 0; optionIndex < options.length; optionIndex++) {
        await connection.query(
          `INSERT INTO quiz_question_options (question_id, option_text, option_order, is_correct)
           VALUES (?, ?, ?, ?)`,
          [
            questionId,
            String(options[optionIndex]).trim(),
            optionIndex + 1,
            optionIndex === Number(question.correct) ? 1 : 0,
          ],
        );
      }
    }

    await connection.commit();
    res.json({ message: 'Quiz actualizado correctamente.' });
  } catch (error) {
    await connection.rollback();
    console.error('Error updating quiz:', error);
    res.status(500).json({ message: 'No se pudo actualizar el quiz.' });
  } finally {
    connection.release();
  }
});

app.delete('/api/admin/quizzes/:id', async (req, res) => {
  try {
    await pool.query(`UPDATE quizzes SET is_active = 0 WHERE quiz_id = ?`, [Number(req.params['id'])]);
    res.json({ message: 'Quiz desactivado correctamente.' });
  } catch (error) {
    console.error('Error deleting quiz:', error);
    res.status(500).json({ message: 'No se pudo eliminar el quiz.' });
  }
});

app.delete('/api/admin/products/:id', async (req, res) => {
  try {
    await pool.query(`UPDATE marketplace_items SET status = 'deleted' WHERE item_id = ?`, [Number(req.params['id'])]);
    res.json({ message: 'Producto retirado correctamente.' });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ message: 'No se pudo retirar el producto.' });
  }
});

app.post('/api/admin/news', async (req, res) => {
  const { adminUserId, title, summary, category, content, imageData } = req.body ?? {};

  if (!adminUserId || !title || !content) {
    res.status(400).json({ message: 'Completa el titulo y contenido de la noticia.' });
    return;
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [newsResult] = await connection.query<mysql.ResultSetHeader>(
      `INSERT INTO news_posts
        (author_user_id, title, slug, summary, content, category, status, published_at)
       VALUES (?, ?, ?, ?, ?, ?, 'published', NOW())`,
      [
        Number(adminUserId),
        String(title).trim(),
        `${slugify(String(title))}-${Date.now()}`,
        String(summary || '').trim() || null,
        String(content).trim(),
        String(category || 'Noticias').trim() || null,
      ],
    );

    const newsId = Number(newsResult.insertId);

    if (imageData) {
      const parsedImage = dataUrlToBuffer(String(imageData));

      if (parsedImage) {
        await connection.query(
          `INSERT INTO news_images
            (news_id, image_name, image_mime, image_data, alt_text, is_cover, sort_order)
           VALUES (?, ?, ?, ?, ?, 1, 1)`,
          [newsId, `${slugify(String(title)) || 'noticia'}.jpg`, parsedImage.mimeType, parsedImage.buffer, String(title)],
        );
      }
    }

    await connection.commit();
    res.status(201).json({ message: 'Noticia publicada correctamente.' });
  } catch (error) {
    await connection.rollback();
    console.error('Error creating news:', error);
    res.status(500).json({ message: 'No se pudo publicar la noticia.' });
  } finally {
    connection.release();
  }
});

app.delete('/api/admin/news/:id', async (req, res) => {
  try {
    await pool.query(`UPDATE news_posts SET status = 'archived' WHERE news_id = ?`, [Number(req.params['id'])]);
    res.json({ message: 'Noticia archivada correctamente.' });
  } catch (error) {
    console.error('Error deleting news:', error);
    res.status(500).json({ message: 'No se pudo archivar la noticia.' });
  }
});

app.post('/api/auth/register', async (req, res) => {
  const {
    firstName,
    lastName,
    email,
    username,
    password,
    confirmPassword,
    career,
    termsAccepted,
  } = req.body ?? {};

  if (!firstName || !lastName || !email || !username || !password || !confirmPassword) {
    res.status(400).json({ message: 'Completa todos los campos obligatorios.' });
    return;
  }

  if (String(password) !== String(confirmPassword)) {
    res.status(400).json({ message: 'Las contraseñas no coinciden.' });
    return;
  }

  if (!termsAccepted) {
    res.status(400).json({ message: 'Debes aceptar los terminos.' });
    return;
  }

  try {
    const [existingRows] = await pool.query<mysql.RowDataPacket[]>(
      'SELECT user_id FROM users WHERE email = ? OR username = ? LIMIT 1',
      [String(email).trim().toLowerCase(), String(username).trim()],
    );

    if (existingRows.length) {
      res.status(409).json({ message: 'Ya existe un usuario con ese correo o gamertag.' });
      return;
    }

    const roleId = await ensureRole('student');
    const careerId = await ensureCareer(career ? String(career) : null);
    const passwordHash = await hashPassword(String(password));

    await pool.query(
      `INSERT INTO users
        (role_id, career_id, first_name, last_name, username, email, password_hash, terms_accepted, email_verified, account_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, 'active')`,
      [
        roleId,
        careerId,
        String(firstName).trim(),
        String(lastName).trim(),
        String(username).trim(),
        String(email).trim().toLowerCase(),
        passwordHash,
      ],
    );

    res.status(201).json({ message: 'Cuenta creada correctamente.' });
  } catch (error) {
    console.error('Error registering user:', error);
    res.status(500).json({ message: 'No se pudo crear la cuenta.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body ?? {};

  if (!email || !password) {
    res.status(400).json({ message: 'Ingresa tu correo y contraseña.' });
    return;
  }

  try {
    const [rows] = await pool.query<mysql.RowDataPacket[]>(
      `SELECT u.user_id, u.username, u.email, u.password_hash, u.role_id, u.account_status, r.role_name
       FROM users u
       INNER JOIN roles r ON r.role_id = u.role_id
       WHERE u.email = ?
       LIMIT 1`,
      [String(email).trim().toLowerCase()],
    );

    if (!rows.length) {
      res.status(401).json({ message: 'Credenciales incorrectas.' });
      return;
    }

    const user = rows[0];

    if (user['account_status'] !== 'active') {
      res.status(403).json({ message: 'Tu cuenta no esta activa.' });
      return;
    }

    const isValid = await verifyPassword(String(password), user['password_hash']);

    if (!isValid) {
      res.status(401).json({ message: 'Credenciales incorrectas.' });
      return;
    }

    await pool.query('UPDATE users SET last_login_at = NOW() WHERE user_id = ?', [user['user_id']]);

    res.json({
      message: 'Inicio de sesion correcto.',
      user: {
        id: Number(user['user_id']),
        username: user['username'],
        email: user['email'],
        roleId: Number(user['role_id']),
        roleName: user['role_name'],
      },
    });
  } catch (error) {
    console.error('Error logging in:', error);
    res.status(500).json({ message: 'No se pudo iniciar sesion.' });
  }
});

app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) => (response ? writeResponseToNodeResponse(response, res) : next()))
    .catch(next);
});

if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = Number(process.env['PORT'] || 4000);

  app.listen(port, '0.0.0.0', () => {
    console.log(`Node Express server listening on http://0.0.0.0:${port}`);
  });
}

export const reqHandler = createNodeRequestHandler(app);
