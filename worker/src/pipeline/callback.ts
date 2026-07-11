import axios from 'axios';

interface CallbackPayload {
  job_id: string;
  status: 'done' | 'failed';
  clips: {
    id: string;
    start_time: number;
    end_time: number;
    title: string;
    reason: string;
    file_path: string | null;
    status: string;
  }[];
}

export async function sendCallback(
  callbackUrl: string,
  payload: CallbackPayload,
  retries = 3,
  delayMs = 2000
): Promise<void> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`[Callback] Sending callback to ${callbackUrl} (Attempt ${attempt}/${retries})...`);
      await axios.post(callbackUrl, payload, { timeout: 10000 });
      console.log(`[Callback] Callback sent successfully.`);
      return;
    } catch (error: any) {
      console.error(
        `[Callback] Attempt ${attempt} failed. Error: ${error.message}`
      );
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      } else {
        console.error(`[Callback] All callback attempts failed. Continuing without throwing error.`);
      }
    }
  }
}
