const express = require("express");
const cheerio = require("cheerio");
const cors = require("cors");

const app = express();
app.use(cors());

app.get("/api/recipe", async (req, res) => {
  const targetUrl = req.query.url;
  const response = await fetch(targetUrl);
  const html = await response.text();

  const $ = cheerio.load(html);
  const scripts = $('script[type="application/ld+json"]');

  let recipeData = null;

  scripts.each((i, el) => {
    try {
      const data = JSON.parse($(el).html());
      if (data["@type"] === "Recipe") {
        recipeData = data;
      } else if (data["@graph"]) {
        recipeData = data["@graph"].find(item => item["@type"] === "Recipe")
      }
    } catch (e) {
      console.log("Couldn't parse one:", e);
    }
  });

  res.json(recipeData);
});

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});