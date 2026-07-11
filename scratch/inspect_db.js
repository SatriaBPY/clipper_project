const { PrismaClient } = require('@prisma/client');
const path = require('path');

// Set database URL to the local storage DB
process.env.DATABASE_URL = 'file:' + path.resolve(__dirname, '../storage/db.sqlite');

const prisma = new PrismaClient();

async function main() {
  try {
    const jobs = await prisma.job.findMany({
      orderBy: { createdAt: 'desc' },
      take: 1,
      include: {
        transcript: true,
        clips: true,
      }
    });

    if (jobs.length === 0) {
      console.log('No jobs found in database.');
      return;
    }

    const job = jobs[0];
    console.log('--- LATEST JOB ---');
    console.log(`ID: ${job.id}`);
    console.log(`URL: ${job.youtubeUrl}`);
    console.log(`Status: ${job.status}`);
    console.log(`Error: ${job.error}`);
    console.log(`Created At: ${job.createdAt}`);

    if (job.transcript) {
      console.log('\n--- TRANSCRIPT ---');
      console.log(`Full Text Length: ${job.transcript.fullText.length} characters`);
      console.log(`Full Text Word Count: ${job.transcript.fullText.split(/\s+/).length} words`);
      
      const words = JSON.parse(job.transcript.wordTimestamps);
      console.log(`Word timestamps count: ${words.length}`);
      if (words.length > 0) {
        console.log(`First word: "${words[0].word}" at ${words[0].start}s`);
        console.log(`Last word: "${words[words.length - 1].word}" at ${words[words.length - 1].end}s`);
      }
    } else {
      console.log('\n--- NO TRANSCRIPT FOUND ---');
    }

    console.log('\n--- GENERATED CLIPS ---');
    console.log(`Total clips: ${job.clips.length}`);
    job.clips.forEach((clip, idx) => {
      console.log(`[Clip ${idx + 1}] Title: "${clip.title}"`);
      console.log(`  Duration: ${(clip.endTime - clip.startTime).toFixed(2)}s (${clip.startTime.toFixed(2)}s -> ${clip.endTime.toFixed(2)}s)`);
      console.log(`  Reason: ${clip.reason}`);
      console.log(`  Status: ${clip.status}`);
      console.log(`  Error: ${clip.error}`);
    });

  } catch (err) {
    console.error('Error running script:', err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
