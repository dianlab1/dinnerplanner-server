const express = require("express");
const cors = require("cors");
const { chromium } = require("playwright");

const app = express();

app.use(cors());


// --------------------------------------------------
// FIND RECIPE IN JSON-LD
// --------------------------------------------------

function isRecipe(data) {
  if (!data) return false;

  const type = data["@type"];

  return (
    type === "Recipe" ||
    (Array.isArray(type) && type.includes("Recipe"))
  );
}


function findRecipe(data) {
  if (!data) return null;


  // Direct Recipe object
  if (isRecipe(data)) {
    return data;
  }


  // @graph
  if (Array.isArray(data["@graph"])) {

    const recipe = data["@graph"].find(item =>
      isRecipe(item)
    );

    if (recipe) {
      return recipe;
    }
  }


  // Array of JSON-LD objects
  if (Array.isArray(data)) {

    const recipe = data.find(item =>
      isRecipe(item)
    );

    if (recipe) {
      return recipe;
    }
  }


  return null;
}


// --------------------------------------------------
// NORMALIZE INSTRUCTIONS
// --------------------------------------------------

function normalizeInstructions(recipeInstructions) {

  if (!Array.isArray(recipeInstructions)) {
    return [];
  }


  return recipeInstructions.flatMap(item => {

    // Plain string
    if (typeof item === "string") {
      return [item];
    }


    // HowToStep
    if (item && typeof item === "object" && item.text) {
      return [item.text];
    }


    // HowToSection
    if (
      item &&
      typeof item === "object" &&
      Array.isArray(item.itemListElement)
    ) {

      return item.itemListElement
        .map(step => {

          if (typeof step === "string") {
            return step;
          }

          if (step && step.text) {
            return step.text;
          }

          return "";
        })
        .filter(Boolean);
    }


    return [];
  });
}


// --------------------------------------------------
// RECIPE API
// --------------------------------------------------

app.get("/api/recipe", async (req, res) => {

  let browser = null;


  try {

    const targetUrl = req.query.url;


    // --------------------------------------------------
    // VALIDATE URL
    // --------------------------------------------------

    if (!targetUrl) {

      return res.status(400).json({
        error: "No recipe URL provided"
      });

    }


    let parsedUrl;

    try {

      parsedUrl = new URL(targetUrl);

    } catch {

      return res.status(400).json({
        error: "Invalid recipe URL"
      });

    }


    if (
      parsedUrl.protocol !== "http:" &&
      parsedUrl.protocol !== "https:"
    ) {

      return res.status(400).json({
        error: "Only HTTP and HTTPS URLs are allowed"
      });

    }


    console.log("Fetching:", targetUrl);


    // --------------------------------------------------
    // START CHROMIUM
    // --------------------------------------------------

    browser = await chromium.launch({
      headless: true,

      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu"
      ]
    });


    const context = await browser.newContext({

      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
        "AppleWebKit/537.36 (KHTML, like Gecko) " +
        "Chrome/142.0.0.0 Safari/537.36",

      viewport: {
        width: 1366,
        height: 768
      },

      locale: "en-US",

      timezoneId: "America/New_York",

      extraHTTPHeaders: {
        "Accept-Language": "en-US,en;q=0.9"
      }
    });


    const page = await context.newPage();


    // --------------------------------------------------
    // LOAD PAGE
    // --------------------------------------------------

    const response = await page.goto(targetUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30000
    });


    console.log(
      "Response:",
      response ? response.status() : "unknown"
    );


    // Give the page a little time to finish loading
    await page.waitForTimeout(2000);


    // --------------------------------------------------
    // GET JSON-LD
    // --------------------------------------------------

    const jsonLdData = await page.locator(
      'script[type="application/ld+json"]'
    ).allTextContents();


    console.log(
      "JSON-LD scripts found:",
      jsonLdData.length
    );


    let recipeData = null;


    for (const raw of jsonLdData) {

      try {

        if (!raw || !raw.trim()) {
          continue;
        }


        const data = JSON.parse(raw);


        const recipe = findRecipe(data);


        if (recipe) {

          recipeData = recipe;

          console.log(
            "Recipe found:",
            recipe.name || "Unnamed recipe"
          );

          break;
        }

      } catch (error) {

        console.log(
          "Could not parse JSON-LD:",
          error.message
        );

      }
    }


    // --------------------------------------------------
    // FALLBACK: SEARCH PAGE HTML
    // --------------------------------------------------

    if (!recipeData) {

      console.log(
        "Recipe not found in JSON-LD. Searching page HTML..."
      );


      const html = await page.content();


      // This is mainly a diagnostic fallback.
      // Most recipe sites should expose Recipe JSON-LD.

      const recipeMatch = html.match(
        /"@type"\s*:\s*"Recipe"/
      );


      if (!recipeMatch) {

        await browser.close();

        return res.status(404).json({
          error: "No recipe data found on this page"
        });

      }
    }


    // --------------------------------------------------
    // INGREDIENTS
    // --------------------------------------------------

    const ingredients =
      Array.isArray(recipeData.recipeIngredient)
        ? recipeData.recipeIngredient
        : [];


    // --------------------------------------------------
    // INSTRUCTIONS
    // --------------------------------------------------

    const instructions =
      normalizeInstructions(
        recipeData.recipeInstructions
      );


    // --------------------------------------------------
    // RESULT
    // --------------------------------------------------

    const result = {

      name:
        recipeData.name || "",

      description:
        recipeData.description || "",

      image:
        recipeData.image || "",

      prepTime:
        recipeData.prepTime || "",

      cookTime:
        recipeData.cookTime || "",

      totalTime:
        recipeData.totalTime || "",

      recipeIngredient:
        ingredients,

      recipeInstructions:
        instructions
    };


    console.log(
      "Recipe:",
      result.name
    );

    console.log(
      "Ingredients:",
      ingredients.length
    );

    console.log(
      "Instructions:",
      instructions.length
    );


    await browser.close();

    browser = null;


    res.json(result);


  } catch (error) {

    console.error(
      "Recipe fetch error:",
      error
    );


    if (browser) {

      try {
        await browser.close();
      } catch { }

    }


    res.status(500).json({

      error:
        "Failed to fetch recipe",

      message:
        error.message

    });

  }

});


// --------------------------------------------------
// START SERVER
// --------------------------------------------------

const PORT =
  process.env.PORT || 3000;


app.listen(PORT, () => {

  console.log(
    `Server running on port ${PORT}`
  );

});