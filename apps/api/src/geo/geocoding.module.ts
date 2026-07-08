import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { RedisModule } from "../redis/redis.module";
import { AddressGeocoderService } from "./address-geocoder.service";
import { GeoController } from "./geo.controller";

// AuthModule даёт JwtService/JwtAuthGuard для защиты гео-роута (address-suggest),
// доступного любому авторизованному пользователю независимо от торговой площадки.
@Module({
  imports: [RedisModule, AuthModule],
  controllers: [GeoController],
  providers: [AddressGeocoderService],
  exports: [AddressGeocoderService],
})
export class GeocodingModule {}
