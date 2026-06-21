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

    const words = matches.map(m => m.word);
    
    const top5 = words.slice(0, 5);
    const next5 = words.slice(5, 10);
    
    for (let i = top5.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [top5[i], top5[j]] = [top5[j], top5[i]];
    }
    
    for (let i = next5.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [next5[i], next5[j]] = [next5[j], next5[i]];
    }

    res.json([...top5, ...next5]);
  } catch (error) {
    console.error('Search keywords error:', error);
    res.status(500).json({ error: 'Server error searching keywords' });
  }
});

};
