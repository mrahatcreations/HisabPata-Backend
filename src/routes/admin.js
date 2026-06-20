const { prisma } = require('../config/database');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET_FINAL = process.env.JWT_SECRET || 'dev_secret_key_do_not_use_in_production';

module.exports = function(app, { authenticateToken, authenticateAdmin, upload }) {

app.get('/api/admin/settings', authenticateAdmin, async (req, res) => {
  try {
    const settings = await prisma.systemSetting.findMany();
    const result = {};
    settings.forEach(s => result[s.key] = s.value);
    res.json(result);
  } catch (error) {
    console.error('[Admin] Failed to fetch settings:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/admin/settings', authenticateAdmin, async (req, res) => {
  try {
    const { key, value } = req.body;
    if (!key) return res.status(400).json({ error: 'Key is required' });
    
    const setting = await prisma.systemSetting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
    res.json(setting);
  } catch (error) {
    console.error('[Admin] Failed to update setting:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/admin/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const admin = await prisma.admin.findUnique({ where: { email } });
    if (!admin) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, admin.password);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: admin.id, email: admin.email, role: admin.role },
      JWT_SECRET_FINAL,
      { expiresIn: '7d' }
    );

    res.json({ token, admin: { id: admin.id, name: admin.name, email: admin.email, role: admin.role } });
  } catch (error) {
    console.error('[Admin] Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/admin/users', authenticateAdmin, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        phoneNumber: true,
        isAdmin: true,
        avatarUrl: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(users);
  } catch (error) {
    console.error('[Admin] Failed to fetch users:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/admin/complaints', authenticateAdmin, async (req, res) => {
  try {
    const complaints = await prisma.complaint.findMany({
      include: { user: { select: { id: true, name: true, email: true, phoneNumber: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(complaints);
  } catch (error) {
    console.error('[Admin] Failed to fetch complaints:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/admin/complaints', authenticateToken, (req, res) => {
  upload.array('files', 10)(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });

    try {
      const { subject, message, category } = req.body;
      if (!subject || !message) {
        return res.status(400).json({ error: 'Subject and message are required' });
      }

      const imageUrls = [];
      const videoUrls = [];
      if (req.files) {
        for (const file of req.files) {
          const url = `/uploads/${file.filename}`;
          if (file.mimetype.startsWith('video/')) {
            videoUrls.push(url);
          } else {
            imageUrls.push(url);
          }
        }
      }

      const complaint = await prisma.complaint.create({
        data: { userId: req.user.id, subject, message, category: category || null, imageUrls, videoUrls },
      });
      res.status(201).json(complaint);
    } catch (error) {
      console.error('[Admin] Failed to create complaint:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
});

app.put('/api/admin/complaints/:id', authenticateAdmin, async (req, res) => {
  try {
    const { status, priority, assignedTo, response, category } = req.body;
    const data = {};
    if (status !== undefined) data.status = status;
    if (priority !== undefined) data.priority = priority;
    if (assignedTo !== undefined) data.assignedTo = assignedTo;
    if (response !== undefined) data.response = response;
    if (category !== undefined) data.category = category;

    const complaint = await prisma.complaint.update({
      where: { id: req.params.id },
      data,
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    res.json(complaint);
  } catch (error) {
    console.error('[Admin] Failed to update complaint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/admin/orgs', authenticateAdmin, async (req, res) => {
  try {
    const orgs = await prisma.organization.findMany({
      include: {
        _count: { select: { members: true, books: true } },
        members: { where: { role: 'admin', status: 'active' }, include: { user: { select: { id: true, name: true, email: true } } } }
      },
      orderBy: { createdAt: 'desc' },
    });
    const result = orgs.map(o => ({
      id: o.id, name: o.name, isPersonal: o.isPersonal, inviteCode: o.inviteCode,
      approvalPolicy: o.approvalPolicy, createdAt: o.createdAt,
      memberCount: o._count.members, bookCount: o._count.books,
      admins: o.members.map(m => ({ id: m.user.id, name: m.user.name, email: m.user.email }))
    }));
    res.json(result);
  } catch (error) {
    console.error('[Admin] Failed to fetch orgs:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/admin/orgs/:id/members', authenticateAdmin, async (req, res) => {
  try {
    const members = await prisma.organizationMember.findMany({
      where: { organizationId: req.params.id },
      include: { user: { select: { id: true, name: true, email: true, phoneNumber: true, isAdmin: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(members.map(m => ({
      id: m.id, userId: m.userId, role: m.role, status: m.status, permissions: m.permissions, createdAt: m.createdAt,
      user: m.user
    })));
  } catch (error) {
    console.error('[Admin] Failed to fetch members:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/admin/orgs/:id/members/:memberId', authenticateAdmin, async (req, res) => {
  try {
    const member = await prisma.organizationMember.findUnique({ where: { id: req.params.memberId } });
    if (!member) return res.status(404).json({ error: 'Member not found' });
    if (member.organizationId !== req.params.id) return res.status(400).json({ error: 'Member does not belong to this org' });
    await prisma.organizationMember.delete({ where: { id: req.params.memberId } });
    res.json({ message: 'Member removed' });
  } catch (error) {
    console.error('[Admin] Failed to remove member:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/api/admin/orgs/:id', authenticateAdmin, async (req, res) => {
  try {
    const { name, isPersonal, approvalPolicy, categories } = req.body;
    const data = {};
    if (name !== undefined) data.name = name;
    if (isPersonal !== undefined) data.isPersonal = isPersonal;
    if (approvalPolicy !== undefined) data.approvalPolicy = approvalPolicy;
    if (categories !== undefined) data.categories = categories;

    const org = await prisma.organization.update({
      where: { id: req.params.id },
      data,
    });
    res.json(org);
  } catch (error) {
    console.error('[Admin] Failed to update org:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/admin/orgs/:id', authenticateAdmin, async (req, res) => {
  try {
    const org = await prisma.organization.findUnique({ where: { id: req.params.id } });
    if (!org) return res.status(404).json({ error: 'Organization not found' });

    const bookIds = (await prisma.book.findMany({ where: { organizationId: req.params.id }, select: { id: true } })).map(b => b.id);
    const txnIds = bookIds.length > 0
      ? (await prisma.transaction.findMany({ where: { bookId: { in: bookIds } }, select: { id: true } })).map(t => t.id)
      : [];

    await prisma.$transaction([
      prisma.transaction.updateMany({ where: { recipientOrgId: req.params.id }, data: { recipientOrgId: null } }),
      ...(bookIds.length > 0 ? [prisma.transaction.updateMany({ where: { orgFundId: { in: bookIds } }, data: { orgFundId: null } })] : []),
      ...(txnIds.length > 0 ? [prisma.transaction.updateMany({ where: { linkedTransactionId: { in: txnIds } }, data: { linkedTransactionId: null } })] : []),
      prisma.organizationMember.deleteMany({ where: { organizationId: req.params.id } }),
      ...(bookIds.length > 0 ? [prisma.transaction.deleteMany({ where: { bookId: { in: bookIds } } })] : []),
      ...(bookIds.length > 0 ? [prisma.book.deleteMany({ where: { organizationId: req.params.id } })] : []),
      prisma.organization.delete({ where: { id: req.params.id } }),
    ]);

    res.json({ message: 'Organization deleted successfully' });
  } catch (error) {
    console.error('[Admin] Failed to delete org:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/api/admin/users/:id', authenticateAdmin, async (req, res) => {
  try {
    const { 
      isAdmin 
    } = req.body;
    
    const data = {};
    if (isAdmin !== undefined) data.isAdmin = isAdmin;

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data,
      select: { 
        id: true, name: true, email: true, phoneNumber: true, isAdmin: true, 
        avatarUrl: true, createdAt: true
      },
    });

    const ws = require('../websocket');
    if (ws.broadcastToUser) ws.broadcastToUser(user.id, { type: 'user_updated', user });

    res.json(user);
  } catch (error) {
    console.error('[Admin] Failed to update user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/admin/users/:id', authenticateAdmin, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    await prisma.complaint.deleteMany({ where: { userId: req.params.id } });
    await prisma.organizationMember.deleteMany({ where: { userId: req.params.id } });

    const personalOrgs = await prisma.organization.findMany({ where: { isPersonal: true, members: { some: { userId: req.params.id } } } });
    for (const org of personalOrgs) {
      await prisma.transaction.deleteMany({ where: { book: { organizationId: org.id } } });
      await prisma.book.deleteMany({ where: { organizationId: org.id } });
      await prisma.organizationMember.deleteMany({ where: { organizationId: org.id } });
      await prisma.organization.delete({ where: { id: org.id } });
    }

    await prisma.user.delete({ where: { id: req.params.id } });
    res.json({ message: 'User deleted' });
  } catch (error) {
    console.error('[Admin] Failed to delete user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/admin/stats', authenticateAdmin, async (req, res) => {
  try {
    const [userCount, orgCount, bookCount, txnCount, totalExpense, totalIncome] = await Promise.all([
      prisma.user.count(),
      prisma.organization.count(),
      prisma.book.count(),
      prisma.transaction.count(),
      prisma.transaction.aggregate({ _sum: { amount: true }, where: { type: 'expense', reconStatus: 'approved' } }),
      prisma.transaction.aggregate({ _sum: { amount: true }, where: { type: 'income', reconStatus: 'approved' } }),
    ]);

    const orgTypeCounts = await prisma.organization.groupBy({
      by: ['isPersonal'],
      _count: true,
    });

    const memberCount = await prisma.organizationMember.count({ where: { status: 'active' } });
    const pendingMemberCount = await prisma.organizationMember.count({ where: { status: 'pending' } });

    res.json({
      totalUsers: userCount,
      totalOrganizations: orgCount,
      personalOrgs: orgTypeCounts.find(o => o.isPersonal)?._count || 0,
      groupOrgs: orgTypeCounts.find(o => !o.isPersonal)?._count || 0,
      totalBooks: bookCount,
      totalTransactions: txnCount,
      totalExpense: totalExpense._sum.amount || 0,
      totalIncome: totalIncome._sum.amount || 0,
      activeMembers: memberCount,
      pendingMembers: pendingMemberCount,
    });
  } catch (error) {
    console.error('[Admin] Failed to fetch stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/admin/system', authenticateAdmin, async (req, res) => {
  try {
    let dbOk = false;
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbOk = true;
    } catch (e) { dbOk = false; }

    const memory = process.memoryUsage();
    res.json({
      status: dbOk ? 'healthy' : 'degraded',
      nodeVersion: process.version,
      platform: process.platform,
      uptime: process.uptime(),
      memory: {
        rss: Math.round(memory.rss / 1024 / 1024),
        heapTotal: Math.round(memory.heapTotal / 1024 / 1024),
        heapUsed: Math.round(memory.heapUsed / 1024 / 1024),
      },
      database: dbOk ? 'connected' : 'disconnected',
      env: process.env.NODE_ENV || 'development',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Admin] Failed to fetch system status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/admin/reset', authenticateAdmin, async (req, res) => {
  try {
    await prisma.transaction.deleteMany();
    await prisma.book.deleteMany();
    await prisma.organizationMember.deleteMany();
    await prisma.organization.deleteMany();
    await prisma.complaint.deleteMany();
    await prisma.user.deleteMany();
    res.json({ message: 'Database reset complete. Seed account will be recreated on restart.' });
  } catch (error) {
    console.error('[Admin] Failed to reset database:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- Generic Database CRUD (Google Sheets-like) ---

const DB_MODELS = [
  'User', 'Organization', 'OrganizationMember', 'Book', 'Transaction',
  'Complaint', 'AudioNote', 'Notification',
  'NotificationPreference', 'FcmToken', 'Category', 'SystemSetting',
];

const DB_MODEL_RELATIONS = {
  User: { memberships: true, complaints: true, audioNotes: true },
  Organization: { members: true, books: true },
  OrganizationMember: { user: true, organization: true },
  Book: { organization: true, transactions: true },
  Complaint: { user: true },
  AudioNote: { user: true },
};

function getPrismaModel(name) {
  const key = name.charAt(0).toLowerCase() + name.slice(1);
  return prisma[key];
}

app.get('/api/admin/db', authenticateAdmin, (_req, res) => {
  res.json(DB_MODELS);
});

const MODELS_WITH_CREATED_AT = [
  'User', 'Admin', 'Complaint', 'Organization',
  'OrganizationMember', 'Book', 'Transaction', 'AudioNote',
  'Notification', 'NotificationPreference', 'FcmToken', 'Category', 'SystemSetting',
];

app.get('/api/admin/db/:model', authenticateAdmin, async (req, res) => {
  try {
    const { model } = req.params;
    if (!DB_MODELS.includes(model)) return res.status(400).json({ error: 'Invalid model' });
    const delegate = getPrismaModel(model);
    const include = DB_MODEL_RELATIONS[model] || undefined;
    const orderBy = MODELS_WITH_CREATED_AT.includes(model) ? { createdAt: 'desc' } : undefined;
    const records = await delegate.findMany({ include, orderBy });
    res.json(records);
  } catch (error) {
    console.error(`[DB] Failed to fetch ${req.params.model}:`, error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/db/:model/:id', authenticateAdmin, async (req, res) => {
  try {
    const { model, id } = req.params;
    if (!DB_MODELS.includes(model)) return res.status(400).json({ error: 'Invalid model' });
    const delegate = getPrismaModel(model);
    const include = DB_MODEL_RELATIONS[model] || undefined;
    const record = await delegate.findUnique({ where: { id }, include });
    if (!record) return res.status(404).json({ error: 'Record not found' });
    res.json(record);
  } catch (error) {
    console.error(`[DB] Failed to fetch ${req.params.model}/${req.params.id}:`, error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/db/:model', authenticateAdmin, async (req, res) => {
  try {
    const { model } = req.params;
    if (!DB_MODELS.includes(model)) return res.status(400).json({ error: 'Invalid model' });
    const delegate = getPrismaModel(model);
    const record = await delegate.create({ data: req.body });
    res.status(201).json(record);
  } catch (error) {
    console.error(`[DB] Failed to create ${req.params.model}:`, error);
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/admin/db/:model/:id', authenticateAdmin, async (req, res) => {
  try {
    const { model, id } = req.params;
    if (!DB_MODELS.includes(model)) return res.status(400).json({ error: 'Invalid model' });
    const delegate = getPrismaModel(model);
    const record = await delegate.update({ where: { id }, data: req.body });
    res.json(record);
  } catch (error) {
    console.error(`[DB] Failed to update ${req.params.model}/${req.params.id}:`, error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/admin/db/:model/:id', authenticateAdmin, async (req, res) => {
  try {
    const { model, id } = req.params;
    if (!DB_MODELS.includes(model)) return res.status(400).json({ error: 'Invalid model' });
    const delegate = getPrismaModel(model);
    await delegate.delete({ where: { id } });
    res.json({ message: 'Deleted' });
  } catch (error) {
    console.error(`[DB] Failed to delete ${req.params.model}/${req.params.id}:`, error);
    res.status(500).json({ error: error.message });
  }
});

// ─── Keyword Management ──────────────────────────────────────────────────────

// GET /api/admin/keywords — paginated list with search filter
app.get('/api/admin/keywords', authenticateAdmin, async (req, res) => {
  try {
    const { q = '', page = '1', limit = '50', sort = 'count' } = req.query;
    const take = Math.min(parseInt(limit) || 50, 200);
    const skip = (Math.max(parseInt(page) || 1, 1) - 1) * take;
    const orderBy = sort === 'word' ? { word: 'asc' } : { count: 'desc' };

    const where = q.trim().length > 0
      ? { word: { contains: q.trim(), mode: 'insensitive' } }
      : {};

    const [keywords, total] = await Promise.all([
      prisma.noteKeyword.findMany({ where, orderBy, take, skip }),
      prisma.noteKeyword.count({ where }),
    ]);

    res.json({ keywords, total, page: parseInt(page), limit: take });
  } catch (error) {
    console.error('[Admin] Failed to fetch keywords:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/admin/keywords/stats — summary stats
app.get('/api/admin/keywords/stats', authenticateAdmin, async (req, res) => {
  try {
    const [total, topKeywords, agg] = await Promise.all([
      prisma.noteKeyword.count(),
      prisma.noteKeyword.findMany({ orderBy: { count: 'desc' }, take: 10 }),
      prisma.noteKeyword.aggregate({ _sum: { count: true }, _avg: { count: true }, _max: { count: true } }),
    ]);

    res.json({
      totalUniqueWords: total,
      totalUsages: agg._sum.count || 0,
      avgUsagesPerWord: Math.round((agg._avg.count || 0) * 10) / 10,
      maxUsages: agg._max.count || 0,
      topKeywords,
    });
  } catch (error) {
    console.error('[Admin] Failed to fetch keyword stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/admin/keywords/:word — delete a single keyword
app.delete('/api/admin/keywords/:word', authenticateAdmin, async (req, res) => {
  try {
    const word = decodeURIComponent(req.params.word);
    await prisma.noteKeyword.delete({ where: { word } });
    res.json({ message: `Keyword "${word}" deleted` });
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Keyword not found' });
    console.error('[Admin] Failed to delete keyword:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/admin/keywords — clear all keywords
app.delete('/api/admin/keywords', authenticateAdmin, async (req, res) => {
  try {
    const { count } = await prisma.noteKeyword.deleteMany();
    res.json({ message: `Cleared ${count} keywords` });
  } catch (error) {
    console.error('[Admin] Failed to clear keywords:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/admin/keywords/rebuild — rebuild keyword index from all existing transaction notes
app.post('/api/admin/keywords/rebuild', authenticateAdmin, async (req, res) => {
  try {
    // Clear existing index
    await prisma.noteKeyword.deleteMany();

    // Stream all transactions with notes in batches of 500
    const BATCH_SIZE = 500;
    let skip = 0;
    let totalScanned = 0;
    const wordMap = {};

    while (true) {
      const batch = await prisma.transaction.findMany({
        where: { note: { not: null } },
        select: { note: true },
        take: BATCH_SIZE,
        skip,
        orderBy: { id: 'asc' } // Guarantee order for stable pagination
      });
      
      if (batch.length === 0) break;
      totalScanned += batch.length;

      for (const txn of batch) {
        if (!txn.note) continue;
        const rawWords = txn.note.trim().split(/\s+/);
        for (const w of rawWords) {
          const clean = w.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()।??"''""]/g, '').trim();
          if (clean.length > 1) {
            wordMap[clean] = (wordMap[clean] || 0) + 1;
          }
        }
      }
      skip += BATCH_SIZE;
    }

    // Bulk upsert unique words
    const entries = Object.entries(wordMap);
    let inserted = 0;
    const UPSERT_BATCH = 100;
    for (let i = 0; i < entries.length; i += UPSERT_BATCH) {
      const slice = entries.slice(i, i + UPSERT_BATCH);
      await Promise.all(slice.map(([word, count]) =>
        prisma.noteKeyword.upsert({
          where: { word },
          update: { count },
          create: { word, count },
        })
      ));
      inserted += slice.length;
    }

    res.json({
      message: 'Keyword index rebuilt successfully',
      uniqueWords: inserted,
      transactionsScanned: totalScanned,
    });
  } catch (error) {
    console.error('[Admin] Failed to rebuild keyword index:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

};

