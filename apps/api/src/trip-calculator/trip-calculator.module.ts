import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { TripCalculatorController } from "./trip-calculator.controller";
import { TripCalculatorService } from "./trip-calculator.service";

@Module({
  imports: [AuthModule],
  controllers: [TripCalculatorController],
  providers: [TripCalculatorService],
})
export class TripCalculatorModule {}
