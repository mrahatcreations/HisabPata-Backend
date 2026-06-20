const { prisma } = require('../config/database');

module.exports = function(app, { authenticateToken }) {

app.get('/api/keywords/search', authenticateToken, async (req, res) => {
  try {
    const { query } = req.query;
    if (!query || query.trim().length < 2) {
      return res.json([]);
    }

    const matches = await prisma.noteKeyword.findMany({
      where: {
        word: {
          startsWith: query.trim(),
          mode: 'insensitive',
        },
      },
      orderBy: {
        count: 'desc',
      },
      take: 10,
    });

    res.json(matches.map(m => m.word));
  } catch (error) {
    console.error('Search keywords error:', error);
    res.status(500).json({ error: 'Server error searching keywords' });
  }
});

};
