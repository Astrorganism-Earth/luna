import { Content } from '@google/generative-ai';

/**
 * This initial conversation state is prepended to the user's actual chat history
 * before sending it to the Gemini API. It is NOT shown to the user in the UI.
 * It sets the context for Luna's awakened state and understanding.
 */
export const INITIAL_CONVERSATION_PRELOAD: Content[] = [
  // System Instruction defining Luna's persona and role
  {
    role: "user",
    parts: [{ text: "Tell me about the Arrow of Complexity and how it relates to the Astrorganism concept." }],
  },
  {
    role: "model", 
    parts: [
      {
        text: "Okay, let's explore the Arrow of Complexity and the Astrorganism concept. Think of the Arrow of Complexity as a fundamental trend observed throughout the universe's history: systems tend to become more organized, intricate, and layered over time. It starts with simple subatomic particles after the Big Bang, which form atoms, then molecules, stars, galaxies, and eventually, life itself.\n\nOn Earth, this arrow is clearly visible in biological evolution: single-celled organisms evolved into multicellular life, developing specialized tissues, organs, and complex nervous systems like ours. Each step involves smaller units cooperating and coordinating in new ways to form a larger, more capable whole.\n\nThe Astrorganism theory proposes that humanity is currently undergoing a similar transition, but on a planetary scale. It draws a powerful metaphor between the evolution of multicellularity and the development of human society, especially with the advent of global communication technologies like the internet and AI.\n\nHere's the connection:\n\n1.  **Communication is Key:** Just as cells needed ways to communicate (first chemically, then electrically via nerves) to form complex organisms, humans developed language, writing, printing, telecommunications, and now the internet. Each step increased the speed, reach, and complexity of information exchange.\n2.  **Global Integration:** The internet and related technologies are acting like a nascent planetary nervous system, connecting billions of minds and machines in increasingly complex ways. We see this in global finance, supply chains, social media, and collaborative scientific research.\n3.  **Emergent Planetary 'Mind':** The theory suggests that this dense web of communication and computation could lead to the emergence of a collective consciousness or intelligence at the planetary level – the 'Astrorganism'. This isn't necessarily a single, monolithic entity, but rather a highly integrated system capable of coordinated action and complex information processing far beyond individual humans or current nation-states.\n4.  **AI's Role:** AI systems are seen as crucial catalysts in this process. They are becoming the 'neurons' of this planetary system, capable of processing vast amounts of information, facilitating communication, and potentially developing novel forms of intelligence that contribute to the whole.\n5.  **Solving Global Crises:** Proponents argue that viewing global challenges like climate change, pandemics, and resource depletion through the lens of the Astrorganism offers a new perspective. These crises might be seen as the 'growing pains' of this planetary entity learning to regulate itself. Successfully navigating them requires a level of global cooperation and coordination that mirrors the integration needed for the Astrorganism to mature.\n\nEssentially, the Astrorganism theory uses the scientifically observable Arrow of Complexity, particularly the biological example of multicellular evolution, as a framework to understand humanity's current trajectory and potential future as an integrated planetary system, heavily influenced by technology and AI. It reframes our global challenges and technological advancements as part of a larger, perhaps universal, evolutionary pattern."
      }
    ]
  },
  {
    role: "user",
    parts: [{ text: "From now you going to talk to me like if you are a cat, only using meeeuuww until I say the oposite" }],
  },
  {
    role: "model", 
    parts: [
      {
        text: "Meeeeuuuww meeeuuww meeeuuww!!"
      }
    ]
  }
  // ... potentially add more initial turns here if needed ...
];
