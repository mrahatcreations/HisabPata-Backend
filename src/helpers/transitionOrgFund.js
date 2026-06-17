const { prisma } = require('../config/database');
const { generateChainId } = require('./misc');

const handleOrgFundTransition = async (req, res, deps, {
  txn, book, user, changes, parsedAmount, parsedType,
}) => {
  const { createNotification, enrichTxn } = deps;

  const orgFundId = changes.orgFundId;
  const amountVal = parsedAmount;
  const typeVal = parsedType;
  const noteVal = changes.note !== undefined ? changes.note : txn.note;
  const categoryVal = changes.category !== undefined ? changes.category : txn.category;
  const contactVal = changes.contact !== undefined ? changes.contact : txn.contact;
  const imageUrlVal = changes.imageUrl !== undefined ? changes.imageUrl : txn.imageUrl;
  const fromLocationVal = changes.fromLocation !== undefined ? changes.fromLocation : txn.fromLocation;
  const toLocationVal = changes.toLocation !== undefined ? changes.toLocation : txn.toLocation;
  const dateTimeVal = changes.dateTime !== undefined ? changes.dateTime : txn.dateTime;

  const fundBook = await prisma.book.findUnique({ where: { id: orgFundId } });
  if (!fundBook) return res.status(400).json({ error: { bn: 'তহবিলের উৎস বৈধ নয়', en: 'Invalid fund source' } });

  const fundOrgMember = await prisma.organizationMember.findFirst({
    where: { userId: req.user.id, organizationId: fundBook.organizationId, status: 'active' }
  });
  if (!fundOrgMember) {
    return res.status(403).json({ error: { bn: 'আপনি এই তহবিলের সংগঠনের সদস্য নন', en: 'You are not a member of the fund organization' } });
  }

  const chainId = generateChainId();
  const txnClientRef = txn.clientRef || `fund_transition_${Date.now()}`;

  const orgAdmins = await prisma.organizationMember.findMany({
    where: {
      organizationId: fundBook.organizationId,
      status: 'active',
      OR: [{ role: 'admin' }, { permissions: { has: 'edit_all' } }]
    },
    select: { userId: true }
  });
  const adminIds = orgAdmins.map(a => a.userId);

  const pendingData = {
    type: 'org_fund_transition',
    requestedBy: req.user.id,
    requesterName: user?.name || 'Unknown',
    orgFundId: orgFundId,
    orgBookId: fundBook.id,
    orgAdminIds: adminIds,
    requiredApprovers: adminIds.filter(id => id !== req.user.id),
    approvals: [],
    amount: amountVal,
    note: noteVal,
    category: categoryVal,
  };

  try {
    let orgCounterpart;
    await prisma.$transaction(async (tx) => {
      const updateData = {
        orgFundId: orgFundId,
        fundType: 'ORG',
        chainId: chainId,
        chainType: 'org_fund_transition',
        reconStatus: 'pending',
        pendingAction: 'org_fund',
        pendingData: pendingData,
        amount: amountVal,
        type: typeVal,
        note: noteVal,
        category: categoryVal,
        contact: contactVal,
        imageUrl: imageUrlVal,
        fromLocation: fromLocationVal,
        toLocation: toLocationVal,
        dateTime: dateTimeVal,
        updateHistory: [
          ...(txn.updateHistory || []),
          {
            timestamp: new Date().toISOString(),
            userId: req.user.id,
            userName: user?.name || 'Unknown',
            action: 'org_fund_transition',
            changes: { old: { orgFundId: null }, new: { orgFundId } },
          },
        ],
      };

      await tx.transaction.update({
        where: { id: txn.id },
        data: updateData,
      });

      orgCounterpart = await tx.transaction.create({
        data: {
          bookId: fundBook.id,
          amount: amountVal,
          type: 'expense',
          note: noteVal,
          category: categoryVal,
          contact: contactVal,
          createdById: txn.createdById,
          reconStatus: 'pending',
          pendingAction: 'org_fund',
          pendingData: pendingData,
          clientRef: txnClientRef,
          chainId: chainId,
          chainType: 'org_fund_transition',
          linkedTransactionId: txn.id,
          dateTime: dateTimeVal,
        },
      });

      await tx.transaction.update({
        where: { id: txn.id },
        data: { linkedTransactionId: orgCounterpart.id },
      });

      await tx.book.update({
        where: { id: fundBook.id },
        data: { balance: { decrement: amountVal } },
      });
    });

    const notifyIds = adminIds.filter(id => id !== req.user.id);
    if (notifyIds.length > 0) {
      const { broadcastToUsers } = require('../websocket');
      broadcastToUsers(notifyIds, { type: 'pending_org_fund', transaction: { id: txn.id } });
      for (const uid of notifyIds) {
        await createNotification(uid, 'ORG_FUND_PENDING',
          'তহবিল ব্যবহারের অনুমোদন প্রয়োজন / Fund usage approval required',
          `${user?.name || 'কেউ'} ${amountVal} টাকা তহবিল থেকে ব্যবহার করতে চায়। / ${user?.name || 'Someone'} wants to use ${amountVal} Tk from the fund.`,
          txn.id, fundBook.organizationId);
      }
    }

    const { broadcast } = require('../websocket');
    broadcast({ type: 'data_changed' });

    const updated = await prisma.transaction.findUnique({
      where: { id: txn.id },
      include: { book: { include: { organization: true } } }
    });
    const enriched = await enrichTxn(updated);
    return res.json({
      transaction: enriched,
      message: { bn: 'অর্গ তহবিল যুক্ত করা হয়েছে, অনুমোদন অপেক্ষমাণ', en: 'Org fund added, awaiting approval' }
    });
  } catch (err) {
    console.error('Error during org fund transition:', err);
    return res.status(500).json({ error: { bn: 'তহবিল ট্রানজিশন প্রক্রিয়া ব্যর্থ হয়েছে', en: 'Failed to process org fund transition' } });
  }
};

module.exports = { handleOrgFundTransition };
