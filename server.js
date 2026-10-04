const express = require("express");
const cheerio = require("cheerio");
const cors = require("cors");

const app = express();

app.use(cors());

app.get("/api/recipe", async (req, res) => {
  try {
    const targetUrl = req.query.url;

    if (!targetUrl) {
      return res.status(400).json({
        error: "No recipe URL provided"
      });
    }

    // Only allow HTTP/HTTPS URLs
    let parsedUrl;

    try {
      parsedUrl = new URL(targetUrl);
    } catch {
      return res.status(400).json({
        error: "Invalid URL"
      });
    }

    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return res.status(400).json({
        error: "Invalid URL protocol"
      });
    }

    console.log("Fetching:", targetUrl);

    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/142.0.0.0 Safari/537.36",
        "Accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://www.google.com/"
      },
      redirect: "follow"
    });

    console.log("Response:", response.status, response.statusText);

    if (!response.ok) {
      return res.status(502).json({
        error: `Recipe website returned ${response.status}`,
        status: response.status
      });
    }

    const html = await response.text();

    console.log("HTML length:", html.length);

    const $ = cheerio.load(html);

    const scripts = $('script[type="application/ld+json"]');

    console.log("JSON-LD scripts found:", scripts.length);

    let recipeData = null;

    function isRecipe(data) {
      if (!data) return false;

      const type = data["@type"];

      if (type === "Recipe") {
        return true;
      }

      if (Array.isArray(type) && type.includes("Recipe")) {
        return true;
      }

      return false;
    }

    function findRecipe(data) {
      if (!data) return null;

      // Direct Recipe object
      if (isRecipe(data)) {
        return data;
      }

      // @graph
      if (Array.isArray(data["@graph"])) {
        const recipe = data["@graph"].find(item => isRecipe(item));

        if (recipe) {
          return recipe;
        }
      }

      // Array of JSON-LD objects
      if (Array.isArray(data)) {
        const recipe = data.find(item => isRecipe(item));

        if (recipe) {
          return recipe;
        }
      }

      return null;
    }

    scripts.each((i, el) => {
      if (recipeData) return;

      try {
        const raw = $(el).html();

        if (!raw) return;

        const data = JSON.parse(raw);

        const recipe = findRecipe(data);

        if (recipe) {
          recipeData = recipe;
          console.log("Recipe found in JSON-LD");
        }

      } catch (error) {
        console.log("Couldn't parse JSON-LD:", error.message);
      }
    });

    if (!recipeData) {
      console.log("No Recipe JSON-LD found");

      return res.status(404).json({
        error: "No recipe data found on this page"
      });
    }

    // Normalize ingredients
    const ingredients = Array.isArray(recipeData.recipeIngredient)
      ? recipeData.recipeIngredient
      : [];

    // Normalize instructions
    let instructions = [];

    if (Array.isArray(recipeData.recipeInstructions)) {
      instructions = recipeData.recipeInstructions
        .flatMap(item => {
          // HowToStep
          if (typeof item === "object" && item.text) {
            return [item.text];
          }

          // HowToSection
          if (
            typeof item === "object" &&
            Array.isArray(item.itemListElement)
          ) {
            return item.itemListElement
              .map(step => {
                if (typeof step === "string") {
                  return step;
                }

                return step.text || "";
              })
              .filter(Boolean);
          }

          // Plain string
          if (typeof item === "string") {
            return [item];
          }

          return [];
        });
    }

    const result = {
      name: recipeData.name || "",
      description: recipeData.description || "",
      image: recipeData.image || "",
      prepTime: recipeData.prepTime || "",
      cookTime: recipeData.cookTime || "",
      totalTime: recipeData.totalTime || "",
      recipeIngredient: ingredients,
      recipeInstructions: instructions
    };

    console.log(
      "Recipe:",
      result.name,
      "| Ingredients:",
      ingredients.length,
      "| Instructions:",
      instructions.length
    );

    res.json(result);

  } catch (error) {
    console.error("Server error:", error);

    res.status(500).json({
      error: "Failed to fetch recipe",
      message: error.message
    });
  }
});

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});