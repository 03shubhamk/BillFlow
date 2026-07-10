export interface Plan {
  id: string;
  name: string;
  price: number;
  features: string[];
  isPopular?: boolean;
}

export const PLANS: Plan[] = [
  {
    id: "basic",
    name: "Basic",
    price: 9.00,
    features: [
      "1 project",
      "Email support",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: 29.00,
    features: [
      "10 projects",
      "Priority support",
      "Analytics",
    ],
    isPopular: true,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: 99.00,
    features: [
      "Unlimited projects",
      "Dedicated manager",
      "SLA",
    ],
  },
];
