const { prisma } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

module.exports = function(app) {
  // Get Current Profile & State
  app.get('/api/user/profile', authenticateToken, async (req, res) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        include: {
          memberships: {
            include: {
              organization: true,
            }
          }
        }
      });

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Separate active vs pending memberships
      const activeMemberships = user.memberships.filter(m => m.status === 'active');
      const pendingMemberships = user.memberships.filter(m => m.status === 'pending');

      const orgIds = activeMemberships.map(m => m.organizationId);
      const orgs = await prisma.organization.findMany({
        where: { id: { in: orgIds } },
        include: {
          books: true,
          members: { where: { status: 'active' }, include: { user: { select: { id: true, name: true, avatarUrl: true } } } },
        }
      });

      // Get pending org info separately
      const pendingOrgIds = pendingMemberships.map(m => m.organizationId);
      const pendingOrgs = pendingOrgIds.length > 0 ? await prisma.organization.findMany({
        where: { id: { in: pendingOrgIds } },
        select: { id: true, name: true }
      }) : [];

      res.json({
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          phoneNumber: user.phoneNumber,
          tokenVersion: user.tokenVersion,
          avatarUrl: user.avatarUrl,
        },
        organizations: orgs.map(o => ({
          id: o.id,
          name: o.name,
          isPersonal: o.isPersonal,
          inviteCode: o.inviteCode,
          imageUrl: o.imageUrl,
          categories: o.categories,
          role: activeMemberships.find(m => m.organizationId === o.id)?.role || 'member',
          status: 'active',
          books: o.books,
          members: o.members.map(m => ({ id: m.user.id, name: m.user.name, role: m.role, userId: m.userId, avatarUrl: m.user.avatarUrl })),
        })),
        pendingOrganizations: pendingOrgs.map(o => {
          const membership = pendingMemberships.find(m => m.organizationId === o.id);
          return {
            id: o.id,
            name: o.name,
            status: 'pending',
            invitedById: membership?.invitedById,
          };
        }),
      });
    } catch (error) {
      console.error('Profile fetch error:', error);
      res.status(500).json({ error: 'Server error fetching profile' });
    }
  });

  // Search users by name or phone (last 10 digits)
  app.get('/api/users/search', authenticateToken, async (req, res) => {
    try {
      const q = (req.query.q || '').trim();
      if (!q || q.length < 2) {
        return res.json({ users: [] });
      }

      const users = await prisma.user.findMany({
        where: {
          id: { not: req.user.id },
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { phoneNumber: { endsWith: q.slice(-10) } },
            { email: { contains: q, mode: 'insensitive' } },
          ],
        },
        select: { id: true, name: true, avatarUrl: true, phoneNumber: true, email: true },
        take: 20,
      });

      res.json({ users });
    } catch (error) {
      console.error('User search error:', error);
      res.status(500).json({ error: 'Server error searching users' });
    }
  });

  // Check which phone numbers match registered users
  app.post('/api/users/check-contacts', authenticateToken, async (req, res) => {
    try {
      const { phones } = req.body;
      if (!Array.isArray(phones) || phones.length === 0) {
        return res.json({ users: [] });
      }

      // Filter to max 500 phones to prevent abuse/overload
      const uniquePhones = [...new Set(phones)].slice(0, 500);

      const users = await prisma.user.findMany({
        where: {
          id: { not: req.user.id },
          phoneNumber: { in: uniquePhones },
        },
        select: { id: true, name: true, avatarUrl: true, phoneNumber: true, email: true },
      });

      res.json({ users });
    } catch (error) {
      console.error('Check contacts error:', error);
      res.status(500).json({ error: 'Server error checking contacts' });
    }
  });

  // Get org members across current user's organizations
  app.get('/api/org/members', authenticateToken, async (req, res) => {
    try {
      const memberships = await prisma.organizationMember.findMany({
        where: {
          userId: req.user.id,
          status: 'active',
          organization: { isPersonal: false }
        },
        select: { organizationId: true },
      });

      const orgIds = memberships.map(m => m.organizationId);

      const orgMembers = await prisma.organizationMember.findMany({
        where: { organizationId: { in: orgIds }, status: 'active' },
        include: {
          user: { select: { id: true, name: true, phoneNumber: true, email: true, avatarUrl: true } },
          organization: { select: { id: true, name: true } },
        },
      });

      // Group by organization
      const grouped = {};
      for (const m of orgMembers) {
        const orgId = m.organizationId;
        if (!grouped[orgId]) {
          grouped[orgId] = {
            id: orgId,
            name: m.organization.name,
            members: [],
          };
        }
        grouped[orgId].members.push({
          id: m.user.id,
          name: m.user.name,
          phoneNumber: m.user.phoneNumber,
          email: m.user.email,
          avatarUrl: m.user.avatarUrl,
          role: m.role,
        });
      }

      res.json({ organizations: Object.values(grouped) });
    } catch (error) {
      console.error('Org members fetch error:', error);
      res.status(500).json({ error: 'Server error fetching org members' });
    }
  });

  // Update Profile
  app.post('/api/onboarding/complete', authenticateToken, async (req, res) => {
    try {
      const { name, avatarUrl, email, phoneNumber } = req.body;
      if (!name) {
        return res.status(400).json({ error: 'Name is required' });
      }

      const updateData = { name };
      if (avatarUrl !== undefined) {
        updateData.avatarUrl = avatarUrl;
      }
      if (email !== undefined) {
        updateData.email = email || null;
      }
      if (phoneNumber !== undefined) {
        updateData.phoneNumber = phoneNumber || null;
      }

      const updatedUser = await prisma.user.update({
        where: { id: req.user.id },
        data: updateData,
      });

      res.json({
        message: 'Profile updated successfully',
        user: {
          id: updatedUser.id,
          name: updatedUser.name,
          email: updatedUser.email,
          avatarUrl: updatedUser.avatarUrl,
        }
      });
    } catch (error) {
      console.error('Onboarding complete error:', error);
      res.status(500).json({ error: 'Server error completing profile' });
    }
  });

  // User accepts or rejects an invitation
  app.post('/api/user/invitations/:orgId/action', authenticateToken, async (req, res) => {
    try {
      const { action } = req.body;
      if (!['approve', 'reject'].includes(action)) {
        return res.status(400).json({ error: 'Action must be "approve" or "reject"' });
      }

      const membership = await prisma.organizationMember.findUnique({
        where: { userId_organizationId: { userId: req.user.id, organizationId: req.params.orgId } },
        include: { organization: true }
      });

      if (!membership || membership.status !== 'pending' || !membership.invitedById) {
        return res.status(404).json({ error: 'Pending invitation not found' });
      }

      if (action === 'approve') {
        await prisma.organizationMember.update({
          where: { id: membership.id },
          data: { status: 'active' }
        });
        const { broadcast } = require('../websocket');
        broadcast({ type: "data_changed" });
        return res.json({ message: 'Invitation accepted' });
      } else {
        await prisma.organizationMember.delete({ where: { id: membership.id } });
        const { broadcast } = require('../websocket');
        broadcast({ type: "data_changed" });
        return res.json({ message: 'Invitation rejected' });
      }
    } catch (error) {
      console.error('Invitation action error:', error);
      res.status(500).json({ error: 'Server error processing invitation' });
    }
  });

};
