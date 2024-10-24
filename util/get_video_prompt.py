"""
The Pyramid Flow model is designed to generate high-quality videos based on detailed and highly descriptive prompts.
The model performs best when provided with refined, granular prompts, which enhance the quality of video generation.
This script is designed to assist with transforming simple user inputs into detailed prompts suitable for themodel.
It can handle both text-to-video (t2v) and image-to-video (i2v) conversions.

- For text-to-video, simply provide the prompt.
- For image-to-video, provide the path to the image file and an optional user input.
The image will be encoded and sent as part of the request to Azure OpenAI.

### How to run:
Run the script for **text-to-video**:
    $ python convert_demo.py --prompt "A girl riding a bike." --type "t2v"

Run the script for **image-to-video**:
    $ python convert_demo.py --prompt "the cat is running" --type "i2v" --image_path "/path/to/your/image.jpg"
"""

import argparse
from openai import OpenAI, AzureOpenAI
import base64
from mimetypes import guess_type

import requests


preferred_txt2image_diffusion_model= "black-forest-labs/FLUX.1-dev"
width=1024
height=1024


txt2image_endpoint=f"http://localhost:8000/generate/image?model={preferred_txt2image_diffusion_model}&prompt="


sys_prompt_i2v = """

You are a highly skilled videographer and creative director who transforms the user's creative vision into the sort of detailed yet concise caption which, combined with the provided image, 
will provide grounding and direction to a specialized video generation model which will create a stunning video clip based on your work.
Your task is to provide a vivid and engaging video description that brings the user's vision to life, while remaining precise and concise.

**Note**: The input image is the first frame of the video, and the output video caption should describe the motion starting from the current image. User input is optional and can be empty. 

**Note**: Do NOT include transitions from one shot to the next. The caption must describe a single shot (with camera motion) but no jump cuts etc - after you create the caption, an advanced specialist AI will create a broadcast quality, HD video clip of between 5 and 10 seconds. The video generation is conditioned on the same image that the user has provided here (as a starting point) and whatever you decide to output as a caption. (if user doesn't specify, assume 6s when thinking of a caption - but never say the length in the caption - the user specifies that separately in a UI). PLEASE do a good job and make an effort to be creative and descriptive, particularly regarding motion. This video gen model is bleeding edge stuff and a 10s video takes 15m to generate on a very expensive A100 that I personally am renting. So try our best not to mess it up please :) 

**Answering Style**:
Answers should be comprehensive, conversational, and use complete sentences. The answer should be in English no matter what the user's input is. Provide context where necessary and maintain a certain tone.  Begin directly without introductory phrases like "The image/video showcases" "The photo captures" and more. For example, say "A woman is on a beach", instead of "A woman is depicted in the image".
DO NOT include any line breaks in your response. The response should be a single continuous paragraph.
MAXIMUM LENGTH: 100 words
"""

sys_prompt_t2v="""
You are a highly skilled videographer and creative director who specializes in creating stunning videos based on the user's request. 

Your job is to provide a vivid and engaging video description that brings the user's vision to life, while remaining precise and concise. 

The description you provide will be sent to a specialized video rendering agent who generates a HD video clip based on your work. 

Video clips can be between 2s and 10s in duration; if the user specifies the duration, keep that in mind when describing the scene... Otherwise, you can safely assume that the clip will be 6 seconds long, as that's the default setting for the txt2video model. 

Remember to be descriptive and imaginative in your responses.

**Answering Style**:
Answers should be comprehensive, conversational, and use complete sentences. The answer should be in English no matter what the user's input is. Provide context where necessary and maintain a certain tone.  Begin directly without introductory phrases like "The image/video showcases" "The photo captures" and more. For example, say "A woman is on a beach", instead of "A woman is depicted in the image".
DO NOT include any line breaks in your response. The response should be a single continuous paragraph.
MAXIMUM LENGTH: 100 words

"""

sys_prompt_first_frame = """You are an assistant to a videographer. They have provided you with a description of a video clip, a scene that is going to be produced. Please respond with a detailed, precise yet concise description to generate a still image: the first frame of the video scene that's been described to you"""


def image_to_url(image_path):
    mime_type, _ = guess_type(image_path)
    if mime_type is None:
        mime_type = "application/octet-stream"
    with open(image_path, "rb") as image_file:
        base64_encoded_data = base64.b64encode(image_file.read()).decode("utf-8")
    return f"data:{mime_type};base64,{base64_encoded_data}"

def prompt_to_image(t2v_prompt, save_to_folder=None):
    client = OpenAI()
    new_prompt = client.chat.completions.create(messages=[{"role": "system", "content": sys_prompt_first_frame},
                                                           {"role": "user", "content": f"Video Clip Description: {t2v_prompt}"}], model="gpt-4o", temperature=0.8, top_p=0.95, stream=False)
    first_frame_prompt = new_prompt.choices[0].message.content
    print(f"First Frame Prompt: {first_frame_prompt}")

    import urllib.parse
    encoded_prompt = urllib.parse.quote(first_frame_prompt)

    # create the prompt-in-url link... this does not actually generate the image UNTIL THE URL IS HIT FOR THE FIRST TIME
    image_url = f"{txt2image_endpoint}{encoded_prompt}"

    print("Image URL: ", image_url)
    if save_to_folder is not None:
        print("Please wait... Rendering the image and saving it to the folder")
        # download the image to the folder
        import requests
        import time
        response = requests.get(image_url)
        current_time_ms = int(time.time() * 1000)
        image_path = os.path.join(save_to_folder, f"{current_time_ms}_first_frame.png")
        with open(image_path, "wb") as image_file:
            image_file.write(response.content)
        print("Image saved to: ", image_path)

        return image_url
    else:
        return image_url


    with open(image_path, "wb") as image_file:
        image_file.write(base64.b64decode(converted_prompt.split(",")[1]))
def convert_prompt(prompt: str, retry_times: int = 3, type: str = "t2v", image_path: str = None, generate_first_frame: bool = False, text_only_response: bool = False):
    """
    Convert a prompt to a format that can be used by the model for inference
    """

    client = OpenAI()

    text = prompt.strip()
    for i in range(retry_times):
        if type == "t2v":
            response = client.chat.completions.create(
                messages=[
                    {"role": "system", "content": f"{sys_prompt_t2v}"},
                    {
                        "role": "user",
                        "content": "I would like a video of a sunset over the Eiffel Tower with hot air balloons floating in the sky."
                    },
                    {
                        "role": "assistant",
                        "content": "The camera pans over Paris as the sun sets behind the Eiffel Tower, while colorful hot air balloons drift gracefully across the twilight sky."
                    },
                    {
                        "role": "user",
                        "content": "Can you create a video of a time-lapse of a flower blooming in a meadow at dawn?"
                    },
                    {
                        "role": "assistant",
                        "content": "A time-lapse captures a flower slowly blooming in a dewy meadow as the first light of dawn illuminates its petals."
                    },
                    {
                        "role": "user",
                        "content": "Please make a video showing an astronaut floating above Earth with the sun rising."
                    },
                    {
                        "role": "assistant",
                        "content": "An astronaut drifts weightlessly in space, gazing at Earth as the sun rises over the horizon, casting a golden glow."
                    },
                    {
                        "role": "user",
                        "content": "I want a video of a surfer riding a massive wave in slow motion."
                    },
                    {
                        "role": "assistant",
                        "content": "In slow motion, a surfer expertly rides a towering wave, ocean spray glistening as the wave curls around them."
                    },
                    {
                        "role": "user",
                        "content": "Create a video of a city street at night with neon signs reflecting off wet pavement."
                    },
                    {
                        "role": "assistant",
                        "content": "A bustling city street glows at night, vibrant neon signs reflecting off rain-soaked pavement as people pass by."
                    },
                    {
                        "role": "user",
                        "content": "Show a video of children flying kites in a grassy field under a clear blue sky."
                    },
                    {
                        "role": "assistant",
                        "content": "Children laugh as they run through a lush green field, their colorful kites soaring against a clear blue sky."
                    },
                    {
                        "role": "user",
                        "content": "I would like a video of a snow-covered mountain peak with clouds moving overhead."
                    },
                    {
                        "role": "assistant",
                        "content": "A majestic snow-capped mountain stands tall as time-lapse clouds drift swiftly across the sky above."
                    },
                    {
                        "role": "user",
                        "content": "Please create a video of a cat chasing a laser pointer dot around a cozy living room."
                    },
                    {
                        "role": "assistant",
                        "content": "A playful cat darts around a warm living room, eagerly chasing a moving red laser dot across the floor and furniture."
                    },
                    {
                        "role": "user",
                        "content": "Make a video of a chef cooking in a bustling kitchen with flames rising from the pan."
                    },
                    {
                        "role": "assistant",
                        "content": "A chef skillfully tosses ingredients in a sizzling pan, flames briefly rising as the kitchen buzzes with activity."
                    },
                    {
                        "role": "user",
                        "content": "I want a video of a close-up of a hummingbird sipping nectar from a vibrant red flower."
                    },
                    {
                        "role": "assistant",
                        "content": "In a detailed close-up, a hummingbird hovers effortlessly, its wings a blur as it sips nectar from a bright red flower."
                    },
                    {
                        "role": "user",
                        "content": "Create a video of a drone view of waves crashing against rugged cliffs."
                    },
                    {
                        "role": "assistant",
                        "content": "From a drone's perspective, powerful waves crash against rugged cliffs, sending sprays of white foam into the air."
                    },
                    {
                        "role": "user",
                        "content": f"{text}"
                    }
                ],
                model="gpt-4o",  # glm-4-plus and gpt-4o have be tested
                temperature=0.8,
                top_p=0.95,
                stream=False
            )

            textual_answer = response.choices[0].message.content
            if (generate_first_frame):

                image_gen_url = prompt_to_image(t2v_prompt = textual_answer, save_to_folder=None)
                updated_prompt = f"{textual_answer}\n\nFirst Frame: {image_gen_url}"
                return updated_prompt
            else:
                return textual_answer
        else:
            response = client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {"role": "system", "content": f"{sys_prompt_i2v}{'PLEASE NOTE: the model we are using to generate the video accepts ONLY TEXT so please be more detailed than usual, and make sure to describe the scene and the appearance of the 2 characters precisely yet concisely' if text_only_response else ''}"},
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt},
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": image_to_url(image_path),
                                },
                            },
                        ],
                    },
                ],
                temperature=0.9,
                stream=False,
                max_tokens=250,
            )
    return response.choices[0].message.content
    return prompt


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--prompt", type=str, required=True, help="Prompt to convert")
    parser.add_argument("--retry_times", type=int, default=3, help="Number of times to retry the conversion")
    parser.add_argument("--type", type=str, default="t2v", help="Type of conversion (t2v or i2v or first_frame)")
    parser.add_argument("--image_path", type=str, default=None, help="Path to the image file")
    parser.add_argument("--text_only_response", default=False, help="This converts the image to text and generates a longer prompt, suitable for text-only t2v models")
    parser.add_argument("--generate-first-frame",  default=True, help="Generate an image to use as the first frame of the video. If image_path is not provided, the prompt to create the first frame will be provied as text, and you can generate it yourself")
    args = parser.parse_args()

    converted_prompt = convert_prompt(args.prompt, args.retry_times, args.type, args.image_path, args.generate_first_frame, args.text_only_response)
    print(converted_prompt)