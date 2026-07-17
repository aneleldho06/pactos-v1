import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Keypair } from '@stellar/stellar-sdk';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../../platform/prisma.module';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService, private readonly jwt: JwtService) {}
  async challenge(walletAddress: string) {
    const nonce = randomUUID(); const expiresAt = new Date(Date.now() + 5 * 60_000);
    const network = this.config.getOrThrow<string>('STELLAR_NETWORK');
    await this.prisma.authChallenge.create({ data: { walletAddress, nonce, domain: 'pactos', network, expiresAt } });
    return { nonce, expiresAt, message: `PactOS Login\nDomain: pactos\nNetwork: ${network}\nNonce: ${nonce}\nExpires: ${expiresAt.toISOString()}` };
  }
  async verify(input: { walletAddress: string; nonce: string; signature: string }) {
    const challenge = await this.prisma.authChallenge.findUnique({ where: { nonce: input.nonce } });
    if (!challenge || challenge.consumedAt || challenge.expiresAt <= new Date() || challenge.walletAddress !== input.walletAddress) throw new UnauthorizedException('Invalid or expired challenge');
    const message = `PactOS Login\nDomain: ${challenge.domain}\nNetwork: ${challenge.network}\nNonce: ${challenge.nonce}\nExpires: ${challenge.expiresAt.toISOString()}`;
    let valid = false; try { valid = Keypair.fromPublicKey(input.walletAddress).verify(Buffer.from(message), Buffer.from(input.signature, 'base64')); } catch { throw new UnauthorizedException('Invalid wallet signature'); }
    if (!valid) throw new UnauthorizedException('Invalid wallet signature');
    const user = await this.prisma.$transaction(async (tx) => {
      const consumed = await tx.authChallenge.updateMany({ where: { id: challenge.id, consumedAt: null }, data: { consumedAt: new Date() } });
      if (consumed.count !== 1) throw new ConflictException('Challenge already consumed');
      const wallet = await tx.wallet.upsert({ where: { address: input.walletAddress }, update: { status: 'VERIFIED', verifiedAt: new Date() }, create: { address: input.walletAddress, network: challenge.network, status: 'VERIFIED', verifiedAt: new Date(), user: { create: {} } }, include: { user: true } });
      return wallet.user;
    });
    const accessToken = await this.jwt.signAsync({ sub: user.id, wallet: input.walletAddress }, { secret: this.config.getOrThrow('JWT_ACCESS_SECRET'), expiresIn: this.config.get('JWT_ACCESS_TTL', '15m') });
    const refreshToken = await this.jwt.signAsync({ sub: user.id, typ: 'refresh' }, { secret: this.config.getOrThrow('JWT_REFRESH_SECRET'), expiresIn: this.config.get('JWT_REFRESH_TTL', '30d') });
    await this.prisma.session.create({ data: { userId: user.id, refreshTokenHash: createHash('sha256').update(refreshToken).digest('hex'), expiresAt: new Date(Date.now() + 30 * 24 * 3600_000) } });
    return { accessToken, refreshToken, user: { id: user.id, walletAddress: input.walletAddress } };
  }
}
