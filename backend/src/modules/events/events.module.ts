import { Module } from '@nestjs/common';
import { BlockchainModule } from '../blockchain/blockchain.module';
import { EventIndexerService } from './event-indexer.service';
@Module({ imports: [BlockchainModule], providers: [EventIndexerService], exports: [EventIndexerService] }) export class EventsModule {}
