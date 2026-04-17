import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const INGREDIENTS = [
  { canonicalName: "chicken breast", category: "meat", aliases: ["chicken", "boneless chicken", "chicken fillet"] },
  { canonicalName: "ground beef", category: "meat", aliases: ["minced beef", "beef mince"] },
  { canonicalName: "salmon", category: "seafood", aliases: ["salmon fillet", "atlantic salmon"] },
  { canonicalName: "egg", category: "dairy", aliases: ["eggs", "large egg"] },
  { canonicalName: "milk", category: "dairy", aliases: ["whole milk", "2% milk", "skim milk"] },
  { canonicalName: "butter", category: "dairy", aliases: ["unsalted butter", "salted butter"] },
  { canonicalName: "cheddar cheese", category: "dairy", aliases: ["cheddar", "shredded cheddar"] },
  { canonicalName: "tomato", category: "produce", aliases: ["tomatoes", "roma tomato", "cherry tomato"] },
  { canonicalName: "onion", category: "produce", aliases: ["onions", "yellow onion", "white onion", "red onion"] },
  { canonicalName: "garlic", category: "produce", aliases: ["garlic clove", "garlic cloves", "minced garlic"] },
  { canonicalName: "potato", category: "produce", aliases: ["potatoes", "russet potato", "yukon gold"] },
  { canonicalName: "carrot", category: "produce", aliases: ["carrots", "baby carrots"] },
  { canonicalName: "broccoli", category: "produce", aliases: ["broccoli florets"] },
  { canonicalName: "spinach", category: "produce", aliases: ["baby spinach", "fresh spinach"] },
  { canonicalName: "bell pepper", category: "produce", aliases: ["capsicum", "red pepper", "green pepper"] },
  { canonicalName: "lemon", category: "produce", aliases: ["lemons", "lemon juice"] },
  { canonicalName: "rice", category: "grains", aliases: ["white rice", "jasmine rice", "basmati rice"] },
  { canonicalName: "pasta", category: "grains", aliases: ["spaghetti", "penne", "fettuccine", "noodles"] },
  { canonicalName: "bread", category: "grains", aliases: ["white bread", "whole wheat bread", "sourdough"] },
  { canonicalName: "flour", category: "grains", aliases: ["all-purpose flour", "plain flour", "wheat flour"] },
  { canonicalName: "olive oil", category: "condiments", aliases: ["extra virgin olive oil", "evoo"] },
  { canonicalName: "soy sauce", category: "condiments", aliases: ["light soy sauce", "dark soy sauce"] },
  { canonicalName: "salt", category: "spices", aliases: ["sea salt", "kosher salt", "table salt"] },
  { canonicalName: "black pepper", category: "spices", aliases: ["pepper", "ground pepper", "cracked pepper"] },
  { canonicalName: "cumin", category: "spices", aliases: ["ground cumin", "cumin seeds"] },
  { canonicalName: "paprika", category: "spices", aliases: ["smoked paprika", "sweet paprika"] },
  { canonicalName: "cinnamon", category: "spices", aliases: ["ground cinnamon", "cinnamon stick"] },
] as const;

async function main() {
  console.log("Seeding ingredients...");
  for (const ing of INGREDIENTS) {
    await prisma.ingredient.upsert({
      where: { canonicalName: ing.canonicalName },
      update: {},
      create: {
        canonicalName: ing.canonicalName,
        category: ing.category as never,
        aliases: ing.aliases as unknown as string[],
        isActive: true,
      },
    });
  }
  console.log(`Seeded ${INGREDIENTS.length} ingredients.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
