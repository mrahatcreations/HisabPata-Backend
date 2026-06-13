const jwt = require('jsonwebtoken');
const { prisma } = require('../config/database');

const JWT_SECRET_FINAL = process.env.JWT_SECRET || 'dev_secret_key_do_not_use_in_production';

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET_FINAL, async (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }

    try {
      const dbUser = await prisma.user.findUnique({ where: { id: decoded.id } });
      if (!dbUser || dbUser.tokenVersion !== decoded.tokenVersion) {
        return res.status(403).json({ error: 'Token has been revoked or expired' });
      }
      req.user = decoded;
      next();
    } catch (dbErr) {
      console.error('Auth middleware error:', dbErr);
      return res.status(500).json({ error: 'Internal server error during auth' });
    }
  });
};

const authenticateAdmin = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET_FINAL, async (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }

    try {
      const dbAdmin = await prisma.admin.findUnique({ where: { id: decoded.id } });
      if (!dbAdmin) {
        return res.status(403).json({ error: 'Admin access revoked' });
      }
      req.admin = dbAdmin;
      next();
    } catch (dbErr) {
      console.error('Admin Auth middleware error:', dbErr);
      return res.status(500).json({ error: 'Internal server error during auth' });
    }
  });
};

module.exports = { authenticateToken, authenticateAdmin };
