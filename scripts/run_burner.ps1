$env:DATABASE_URL="file:./burner.db"
npx prisma db push --accept-data-loss
npx tsx scripts/test_deep_dive.ts
