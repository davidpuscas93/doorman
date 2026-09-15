import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

@Processor('tickets')
export class TicketsProcessor extends WorkerHost {
  private readonly logger = new Logger(TicketsProcessor.name);

  async process(job: Job<{ transactionId: string }>): Promise<void> {
    this.logger.log(
      `Sending tickets for transaction ${job.data.transactionId}`,
    );

    // stand-in for a real email provider
    await new Promise((resolve) => setTimeout(resolve, 3000));

    this.logger.log(`Sent tickets for transaction ${job.data.transactionId}`);
  }
}
