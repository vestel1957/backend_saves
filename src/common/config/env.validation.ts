export function validateEnv() {
  const required: Record<string, string[]> = {
    'Database': ['DATABASE_URL'],
    'Auth': ['JWT_SECRET'],
    'Email (SMTP)': ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS'],
  };

  const missing: string[] = [];

  for (const [group, vars] of Object.entries(required)) {
    for (const v of vars) {
      if (!process.env[v]?.trim()) {
        missing.push(`  - ${v} (${group})`);
      }
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `\nMissing required environment variables:\n${missing.join('\n')}\n\n` +
      'Set them in your .env file or environment before starting the application.\n',
    );
  }
}
