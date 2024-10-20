const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');
const { HfInference } = require("@huggingface/inference");

// Initialize the Express app
const app = express();

// Cache directory to store generated images
const CACHE_DIR = process.env.IMAGE_FOLDER || '/home/sam/disseminate/media/image_cache';
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR);
}
const available_models = ["alimama-creative/FLUX.1-Turbo-Alpha", "black-forest-labs/FLUX.1-dev", "black-forest-labs/FLUX.1-schnell", "CompVis/stable-diffusion-v1-4", "Corcelio/mobius", "digiplay/AnalogMadness-realistic-model-v7", "digiplay/AsianBrmBeautyrealmix_v2.0", "digiplay/DonutHoleMix_Beta", "digiplay/KawaiiRealisticAsian_v0.7", "digiplay/m0nst3rfy3-testfix", "digiplay/m3u", "digiplay/MilkyWonderland_v1", "digiplay/Realisian_v6", "digiplay/realmixUnrealjourney_v1", "digiplay/STRANGER", "digiplay/STRANGER-ANIME", "dreamlike-art/dreamlike-diffusion-1.0", "dreamlike-art/dreamlike-photoreal-2.0", "fluently/Fluently-XL-v2", "GraydientPlatformAPI/yamers-nsfw4-xl", "John6666/3x3x3mixxl-v2-sdxl", "John6666/4th-tail-merges-050tponynai-sdxl", "John6666/4th-tail-merges-050wai70-sdxl", "John6666/big-lust-v1-sdxl", "John6666/carnival-unchained-v10-fp8-flux", "John6666/convtest", "John6666/convtest2", "John6666/dgs-4th-darkness-03ad-sdxl", "John6666/digital-af-xlp-v1-sdxl", "John6666/josei-realistic-v11-sdxl", "John6666/lyh-anime-flux-v2a1-fp8-flux", "John6666/mala-anime-mix-nsfw-pony-xl-v5-sdxl-spo", "John6666/mala-anime-mix-nsfw-pony-xl-v5new-sdxl", "John6666/mala-anime-mix-nsfw-pony-xl-v5new-sdxl-spo", "John6666/mala-smooth-v1-sdxl", "John6666/mikoshi-pony-v1-sdxl", "John6666/mklan-aio-nsfw-aio-nextgen-xlv2-sdxl", "John6666/nova-reality-v50-sdxl", "John6666/optimal-criminal-pony-v10-sdxl", "John6666/photo-realistic-pony-v5-sdxl", "John6666/pornworks-real-porn-v03-sdxl", "John6666/pornworks-real-porn-v04-sdxl", "John6666/real-mix-pony-v01-sdxl", "John6666/real-mix-pony-v2-sdxl", "John6666/reasianpony-merge-v10-sdxl", "John6666/relh-checkpoint-v30-sdxl", "John6666/sakuramoon-v10-sdxl", "John6666/sapianf-nude-men-women-for-flux-v20fp16-fp8-flux", "John6666/sorkh-pony-v1-sdxl", "John6666/speciosa-anime-v14-sdxl", "John6666/st2-bedamnrealpony-v1-sdxl", "John6666/suimix-xl-v10-sdxl", "John6666/sumeshi-flux1s-v002e-fp8-flux", "John6666/titania-juggernaut-mix-v1-sdxl", "John6666/titania-mix-realistic-pony-gbv10-sdxl", "John6666/uber-realistic-porn-merge-xl-urpmxl-v6final-sdxl", "John6666/ultimate-realistic-mix-v1-sdxl", "John6666/unlimited-porn-x-sdxl", "John6666/unlimited-porn-xreal-sdxl", "John6666/wai-ani-hentai-pony-v5-sdxl", "John6666/wai-c-v3-sdxl", "John6666/wai-doll-cn-v2-sdxl", "John6666/wai-simpleuse-for-real-pony-v1-sdxl", "Niggendar/duchaitenPonyXLNo_v35", "sd-community/sdxl-flash", "stabilityai/stable-diffusion-2-1", "stabilityai/stable-diffusion-2-base", "stabilityai/stable-diffusion-3-medium-diffusers", "stabilityai/stable-diffusion-xl-base-1.0", "stable-diffusion-v1-5/stable-diffusion-v1-5", "stablediffusionapi/disney-pixar-cartoon", "stablediffusionapi/dreamshaper-v6", "stablediffusionapi/mklan-xxx-nsfw-pony", "stablediffusionapi/newrealityxl-global-nsfw", "UnfilteredAI/NSFW-gen-v2", "Yntec/3DKX", "Yntec/BetterPonyDiffusion", "Yntec/Chip_n_DallE", "Yntec/DramaLlama", "Yntec/DreamlikeShaper", "Yntec/DreamPhotoGASM", "Yntec/DreamWorld", "Yntec/DucHaitenGODofSIMP", "Yntec/ElldrethSDaydreamMix", "Yntec/epiCPhotoGasm", "Yntec/MeinaAlter", "Yntec/MGM", "Yntec/MostClassical", "Yntec/nuipenimix2", "Yntec/Ponygraphy", "Yntec/RevAnimatedV2Rebirth", "Yntec/SCMIX_NightSkyMeina", "Yntec/TrueSight", "Yntec/WoopWoopAnime", "Yntec/YiffyMix", "Yntec/ZootVisionEpsilon"]

// Hugging Face Inference API configuration
const HF_API_URL = 'https://api-inference.huggingface.co/models/';
const HF_API_TOKEN = process.env.HF_API_TOKEN || ''; // Replace with your actual API token
const inferenceClient = new HfInference(HF_API_TOKEN);


const DEFAULT_USER_API_KEY = 'PUBLIC'; // Default API key for demonstration purposes
//const DEFAULT_GUIDANCE_SCALE = 5.0; // Default guidance scale for the diffusion model
const DEFAULT_WIDTH = 1024; // Default width of the generated image
const DEFAULT_HEIGHT = 1024; // Default height of the generated image
// In-memory store for user credits (for demonstration purposes)
// In production, consider using a database
const userCredits = {
  'PUBLIC': 20000,
  'user_api_key_1': 100, // Example API key with 10 credits
  'user_api_key_2': 5   // Example API key with 5 credits
};

const generateImage = async(requestPayload, res, responseFormat) => {
  const prompt = requestPayload.prompt;
  const seed = requestPayload.seed ? parseInt(requestPayload.seed) : parseInt(Math.random() * 100000);
  const modelId = requestPayload.model || 'black-forest-labs/FLUX.1-schnell';
  const apiKey = requestPayload.api_key || DEFAULT_USER_API_KEY;
  const cfg_scale = requestPayload.guidance_scale ? parseFloat(requestPayload.guidance_scale) : 7.0;
  const steps = requestPayload.steps ? parseInt(requestPayload.steps) : 4;
  const width = requestPayload.width ? parseInt(requestPayload.width) : DEFAULT_WIDTH;
  const height = requestPayload.height ? parseInt(requestPayload.height) : DEFAULT_HEIGHT;

  if (!prompt) {
    return res.status(400).send('Error: No prompt provided');
  }

  if (!apiKey) {
    return res.status(400).send('Error: No API key provided');
  }

  // Check if the API key is valid and if the user has enough credits
  if (!userCredits.hasOwnProperty(apiKey)) {
    return res.status(403).send('Error: Invalid API key');
  }

  if (userCredits[apiKey] <= 0) {
    return res.status(403).send('Error: Insufficient credits');
  }

  // Set the seed if provided (for caching purposes, does affect HF API)
  const seedStr =  `_${seed}`

  // Create a hash of the prompt, seed, and modelId to use as the cache key
  const cacheKey = crypto.createHash('sha256').update(`${prompt}${seedStr}_${modelId}`).digest('hex');
  const cachePath = path.join(CACHE_DIR, `${cacheKey}.png`);
  console.log(cachePath)
  // Check if the image already exists in the cache
  if (fs.existsSync(cachePath)) {
    return res.sendFile(cachePath);
  }

  try {
    // Prepare payload for Hugging Face Inference API
    const payload = ({
        "inputs": prompt,
        "parameters": {"width": width, "height": height},
        "seed": seed
        //seed,
        //cfg_scale,
        //steps
    });
    console.log("Payload: ", JSON.stringify(payload, null, 2));
    console.log("Endpoint: ", `${HF_API_URL}${modelId}`);
    // Send request to Hugging Face Inference API to generate the image
    const response = await axios.post(
      `${HF_API_URL}${modelId}`,
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${HF_API_TOKEN}`
        },
        responseType: 'arraybuffer'
      }
    );

    if (response.status !== 200) {
      return res.status(500).send(`Error: Failed to generate image, see response fuckup here: ${JSON.stringify(response)}`);  
    }

    // Deduct one credit from the user's balance
    userCredits[apiKey] -= 1;

    // Save the image to the cache directory
    fs.writeFileSync(cachePath, response.data);

    // Send either the image directly or a link to the image
    if (responseFormat == "url") {
      res.setHeader("Content-Type", "application/json")
      res.json({"image_url": "http://localhost:8000/image_cache/"+ cachePath.split("/").at(-1)})
      res.end()
    } else {
      res.setHeader('Content-Type', 'image/png');
      res.sendFile(cachePath);
    }
  } catch (error) {
    res.status(500).send(`Error: Failed to generate image - ${error.message}`);
  }

}
/*
app.get('/models', async(req, res) =>{
  res.send(available_models)
})

//for prompt-in-url: <img src="https://yourserver.com/generate/image?prompt=A%20large%20hamster&width=1024&height=1024"
app.get('/generate/image', async (req, res) => {
  await generateImage(req.query, res)
});

app.post("/generate", async(req, res)=> {
  await generateImage(req.body, res)
}) */
module.exports = {generateImage}

