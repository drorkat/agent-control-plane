// Re-encrypt every stored secret from the OLD key to the current ENCRYPTION_KEY.
//
// Rotation procedure:
//   1) set ENCRYPTION_KEY=<new> and ENCRYPTION_KEY_OLD=<old>, redeploy. Nothing
//      breaks: decryptSecret falls back to the old key, new writes use the new key.
//   2) run this once to migrate all existing rows to the new key:
//        npm run reencrypt-secrets -w @acp/api
//      (it builds first, then needs ENCRYPTION_KEY, ENCRYPTION_KEY_OLD, DATABASE_URL
//       in the environment — the same values the API runs with.)
//   3) remove ENCRYPTION_KEY_OLD and redeploy.
//
// It never prints secret material: only row ids and counts.
import { PrismaClient } from '@prisma/client';
import { decryptSecret, encryptSecret } from '../dist/common/crypto.js';

const prisma = new PrismaClient();

async function migrate(name, delegate) {
  const rows = await delegate.findMany({
    select: { id: true, ciphertext: true, iv: true, authTag: true },
  });
  let migrated = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      const plaintext = decryptSecret({
        ciphertext: row.ciphertext,
        iv: row.iv,
        authTag: row.authTag,
      });
      const enc = encryptSecret(plaintext);
      await delegate.update({
        where: { id: row.id },
        data: { ciphertext: enc.ciphertext, iv: enc.iv, authTag: enc.authTag },
      });
      migrated += 1;
    } catch (err) {
      failed += 1;
      console.error(`  ! ${name} ${row.id}: ${err.message}`);
    }
  }
  console.log(`${name}: ${migrated} re-encrypted, ${failed} failed (of ${rows.length}).`);
  return failed;
}

(async () => {
  if (!process.env.ENCRYPTION_KEY) {
    console.error('ENCRYPTION_KEY is required.');
    process.exit(1);
  }
  console.log('Re-encrypting stored secrets to the current ENCRYPTION_KEY…');
  let failed = 0;
  failed += await migrate('ProviderCredential', prisma.providerCredential);
  failed += await migrate('GitHubConnection', prisma.gitHubConnection);
  await prisma.$disconnect();
  if (failed > 0) {
    console.error(
      `\nDone with ${failed} failure(s): those rows decrypt with neither ` +
        `ENCRYPTION_KEY nor ENCRYPTION_KEY_OLD. Keep ENCRYPTION_KEY_OLD set and ` +
        `investigate before dropping it.`,
    );
    process.exit(1);
  }
  console.log('\nAll secrets re-encrypted. You can now remove ENCRYPTION_KEY_OLD.');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
