CREATE TABLE `benchmark_observations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`monthKey` varchar(7) NOT NULL,
	`benchmarkValue` decimal(10,3) NOT NULL,
	`sourceLabel` varchar(160) NOT NULL,
	`note` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `benchmark_observations_id` PRIMARY KEY(`id`),
	CONSTRAINT `benchmark_month_unique` UNIQUE(`monthKey`)
);
--> statement-breakpoint
CREATE TABLE `fare_quotes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`routeId` int NOT NULL,
	`observedAt` timestamp NOT NULL,
	`departureDate` timestamp NOT NULL,
	`bookingWindowDays` int NOT NULL,
	`carrier` varchar(60) NOT NULL,
	`fareClass` varchar(48) NOT NULL,
	`baseFare` decimal(12,2) NOT NULL,
	`taxes` decimal(12,2) NOT NULL,
	`totalFare` decimal(12,2) NOT NULL,
	`availability` enum('available','sold_out','cancelled','unknown') NOT NULL DEFAULT 'available',
	`sourceType` enum('permitted_sample','manual_upload') NOT NULL DEFAULT 'permitted_sample',
	`sourceReference` varchar(160) NOT NULL,
	`isDuplicate` int NOT NULL DEFAULT 0,
	`isOutlier` int NOT NULL DEFAULT 0,
	`normalizationNotes` text,
	`ingestedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `fare_quotes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `index_observations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`periodType` enum('daily','weekly','monthly') NOT NULL,
	`periodKey` varchar(12) NOT NULL,
	`indexValue` decimal(10,3) NOT NULL,
	`baselineValue` decimal(10,3) NOT NULL,
	`sampleSize` int NOT NULL,
	`routeCoverage` decimal(8,5) NOT NULL,
	`calculatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `index_observations_id` PRIMARY KEY(`id`),
	CONSTRAINT `index_observations_period_unique` UNIQUE(`periodType`,`periodKey`)
);
--> statement-breakpoint
CREATE TABLE `routes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(16) NOT NULL,
	`origin` varchar(3) NOT NULL,
	`destination` varchar(3) NOT NULL,
	`label` varchar(80) NOT NULL,
	`basketWeight` decimal(8,5) NOT NULL,
	`baselineFare` decimal(12,2) NOT NULL,
	`isActive` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `routes_id` PRIMARY KEY(`id`),
	CONSTRAINT `routes_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE INDEX `fare_quotes_route_observed_idx` ON `fare_quotes` (`routeId`,`observedAt`);--> statement-breakpoint
CREATE INDEX `fare_quotes_window_idx` ON `fare_quotes` (`bookingWindowDays`);