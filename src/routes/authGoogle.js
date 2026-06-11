const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const { prisma } = require('../config/database');

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

module.exports = function(app) {
  app.post('/api/auth/google', async (req, res) => {
    try {
      const { idToken } = req.body;
      if (!idToken) {
        return res.status(400).json({ error: 'ID token is required' });
      }

      // Verify the Google ID token
      const ticket = await client.verifyIdToken({
        idToken,
        audience: process.env.GOOGLE_CLIENT_ID,
      });

      const payload = ticket.getPayload();
      const email = payload.email;
      const name = payload.name;
      const avatarUrl = payload.picture;

      if (!email) {
        return res.status(400).json({ error: 'Email is required from Google Auth' });
      }

      // Find or create user
      let user = await prisma.user.findUnique({
        where: { email },
      });

      if (!user) {
        // Create new user (using a dummy password since they use Google Auth)
        user = await prisma.user.create({
          data: {
            name: name || 'Google User',
            email,
            avatarUrl,
            password: 'google_auth_' + Date.now() + Math.random().toString(36).substring(7),
          },
        });
      } else {
        // Update user's avatar if it changed
        if (avatarUrl && user.avatarUrl !== avatarUrl) {
          user = await prisma.user.update({
            where: { id: user.id },
            data: { avatarUrl },
          });
        }
      }

      // Generate JWT
      const token = jwt.sign(
        { id: user.id, tokenVersion: user.tokenVersion },
        process.env.JWT_SECRET,
        { expiresIn: '30d' }
      );

      res.json({
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          avatarUrl: user.avatarUrl,
        },
      });
    } catch (error) {
      console.error('Google Auth Error:', error);
      res.status(401).json({ error: 'Invalid Google Token' });
    }
  });
};
