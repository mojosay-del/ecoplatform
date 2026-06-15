import { Module } from "@nestjs/common";
import { RedisModule } from "../redis/redis.module";
import { AddressGeocoderService } from "./address-geocoder.service";

@Module({
  imports: [RedisModule],
  providers: [AddressGeocoderService],
  exports: [AddressGeocoderService],
})
export class GeocodingModule {}
