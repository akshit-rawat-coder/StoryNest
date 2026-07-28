import { useEffect, useRef } from "react";
import gsap from "gsap";
import "./TextType.css";

/**
 * TextType — React Bits Typing Animation
 *
 * Animates through an array of strings with a typewriter effect.
 * Inherits font styles from the parent element (no hardcoded typography).
 */
export default function TextType({
  texts = [],
  typingSpeed = 70,
  deletingSpeed = 35,
  pauseDuration = 1800,
  showCursor = true,
  cursorCharacter = "|",
  loop = true,
}) {
  const textRef = useRef(null);
  const cursorRef = useRef(null);
  const indexRef = useRef(0);
  const charIndexRef = useRef(0);
  const isDeletingRef = useRef(false);
  const tlRef = useRef(null);

  useEffect(() => {
    if (!texts.length) return;

    const el = textRef.current;
    if (!el) return;

    let currentText = texts[0];
    let isDeleting = false;
    let charIndex = 0;
    let textIndex = 0;
    let pauseTimeout = null;

    const typeNext = () => {
      if (!el) return;

      if (!isDeleting) {
        // Typing forward
        charIndex++;
        el.textContent = currentText.substring(0, charIndex);

        if (charIndex < currentText.length) {
          tlRef.current = gsap.delayedCall(typingSpeed / 1000, typeNext);
        } else {
          // Finished typing — pause, then start deleting
          pauseTimeout = setTimeout(() => {
            isDeleting = true;
            tlRef.current = gsap.delayedCall(deletingSpeed / 1000, typeNext);
          }, pauseDuration);
        }
      } else {
        // Deleting backwards
        charIndex--;
        el.textContent = currentText.substring(0, charIndex);

        if (charIndex > 0) {
          tlRef.current = gsap.delayedCall(deletingSpeed / 1000, typeNext);
        } else {
          // Finished deleting — move to next text
          isDeleting = false;
          textIndex++;
          if (textIndex >= texts.length) {
            if (loop) {
              textIndex = 0;
            } else {
              // Re-type the last text one final time
              textIndex = texts.length - 1;
              isDeleting = false;
              charIndex = 0;
              tlRef.current = gsap.delayedCall(typingSpeed / 1000, typeNext);
              return;
            }
          }
          currentText = texts[textIndex];
          tlRef.current = gsap.delayedCall(typingSpeed / 1000, typeNext);
        }
      }
    };

    // Start the typing animation
    currentText = texts[0];
    isDeleting = false;
    charIndex = 0;
    textIndex = 0;
    el.textContent = "";
    tlRef.current = gsap.delayedCall(typingSpeed / 1000, typeNext);

    return () => {
      // Cleanup all timers and GSAP calls
      if (tlRef.current) {
        tlRef.current.kill();
      }
      if (pauseTimeout) {
        clearTimeout(pauseTimeout);
      }
    };
    // We intentionally only run this once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <span className="text-type-container">
      <span ref={textRef} />
      {showCursor && (
        <span ref={cursorRef} className="text-type-cursor">
          {cursorCharacter}
        </span>
      )}
    </span>
  );
}

