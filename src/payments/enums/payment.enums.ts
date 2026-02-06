/**
 * Payment Status Enum
 * Represents the status of a payment intent
 */
export enum PaymentIntentStatus {
  CREATED = 'CREATED',
  PAID = 'PAID',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
  FREE_UNLOCK = 'FREE_UNLOCK',
}

/**
 * Payment Transaction Status Enum
 * Represents the status of individual payment transactions
 */
export enum PaymentTransactionStatus {
  INITIATED = 'INITIATED',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
}

/**
 * Payment Purpose Enum
 * Represents what the payment is for
 */
export enum PaymentPurpose {
  CERTIFICATE_BUNDLE = 'CERTIFICATE_BUNDLE',
}

/**
 * Payment Provider Enum
 * Represents the payment gateway provider
 */
export enum PaymentProvider {
  STRIPE = 'stripe',
  RAZORPAY = 'razorpay',
  PAYPAL = 'paypal',
}

/**
 * Payment Target Type Enum
 * Represents the type of entitlement being unlocked
 */
export enum PaymentTargetType {
  CERTIFICATE_BUNDLE = 'CERTIFICATE_BUNDLE',
}

/**
 * Payment Context Type Enum
 * Represents the context in which the payment is made
 */
export enum PaymentContextType {
  COHORT = 'COHORT',
}

/**
 * Payment Target Unlock Status Enum
 * Represents whether the entitlement has been unlocked
 */
export enum PaymentTargetUnlockStatus {
  LOCKED = 'LOCKED',
  UNLOCKED = 'UNLOCKED',
}

