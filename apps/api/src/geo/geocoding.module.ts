import { Module } from "@nestjs/common";
import { AddressGeocoderService } from "./address-geocoder.service";

@Module({
  providers: [AddressGeocoderService],
  exports: [AddressGeocoderService],
})
export class GeocodingModule {}
