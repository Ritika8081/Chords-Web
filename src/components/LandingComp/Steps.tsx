'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';


const CardSlider = () => {
  const cards = [
    {
      title: "Hardware",
      description: "Take a development board, BioAmp hardware, cables & electrodes. Make the connections.",
      image: "./steps/step1.webp",
    },
    {
      title: "Firmware",
      description: "Upload the provided code to your development board using Arduino IDE.",
      image: "./steps/step2.webp",
    },
    {
      title: "Connection",
      description: "Open Chords, click connect, choose COM port and start visualizing the signals.",
      image: "./steps/step3.webp",
    },
    {
      title: "Visualization",
      description: "Keep an eye on the system performance and make necessary adjustments.",
      image: "./steps/step4.webp",
    },
  ];

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [fadeIn, setFadeIn] = useState(false); // State to control fade-in animation

  useEffect(() => {
    // Declare the interval variable with a clear type.
    let interval: NodeJS.Timeout | null = null;

    if (!isPaused) {
      // Start the interval if not paused.
      interval = setInterval(() => {
        setCurrentIndex((prevIndex) => (prevIndex + 1) % cards.length);
      }, 3000);
    }

    // Clear the interval whenever `isPaused` changes.
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isPaused, cards.length]); // Dependency array now includes isPaused.

  useEffect(() => {
    // Trigger fade-in animation on image change
    setFadeIn(true);
    const timer = setTimeout(() => setFadeIn(false), 1000); // Reset after animation completes
    return () => clearTimeout(timer); // Cleanup timer
  }, [currentIndex]);
  const currentCard = cards[currentIndex];

  const handleImageClick = () => {
    setIsModalOpen(true);
  };
  const setIndex = (index: number) => {
    setCurrentIndex(index);
    setIsPaused(true)
  };

  const closeModal = () => {
    setIsModalOpen(false);
  };

  return (
    <section className="flex flex-col mt-12">
      <div className="container grid items-center justify-center text-left max-w-7xl">
        {/* Heading */}
        <div className="space-y-4">
          <h2 className="text-2xl font-bold tracking-wide pl-8 sm:text-3xl md:text-3xl pb-8">
            Get Started in Few Steps
          </h2>
        </div>

        {/* Progress Line and Steps for Small and Medium Screens */}
        <div className="relative mx-16 fade-in after:absolute after:left-8 after:right-8 after:top-1/2 after:block after:h-0.5 after:-translate-y-1/2 after:rounded-lg after:bg-primary max-w-7xl items-center lg:hidden">
          <ol className="relative z-10 flex justify-between text-sm font-medium text-primary">
            {Array.from({ length: 4 }).map((_, index) => (
              <li className="flex items-center bg-background p-2" key={index}>
                <button
                  className={`size-6 rounded-full text-center text-[15px] font-bold text-background ${index === currentIndex ? 'bg-primary' : 'bg-gray-400'}`}
                  onMouseEnter={() => setIndex(index)}
                  onMouseLeave={() => setIsPaused(false)}
                >
                  <span>{index + 1}</span>
                </button>
              </li>
            ))}
          </ol>
        </div>

        {/* Labels for each step (shown on small and medium screens) */}
        <div className="flex justify-between w-full max-w-7xl lg:hidden mb-6">
          <div className="text-center pl-10">
            <p className="text-muted-foreground hidden sm:block">Hardware</p>
          </div>
          <div className="text-center pl-10">
            <p className="text-muted-foreground hidden sm:block">Firmware</p>
          </div>
          <div className="text-center pl-7">
            <p className="text-muted-foreground hidden sm:block">Connection</p>
          </div>
          <div className="text-center">
            <p className="text-muted-foreground pr-10 hidden sm:block">Visualization</p>
          </div>
        </div>

        {/* Main Content with Sidebar on Right for Large Screens */}
        <div className="container flex flex-col lg:flex-row items-center justify-between text-center max-w-6xl sm-mt-10 md-mt-10">
          {/* Image */}
          <div className="w-full lg:w-[90%] h-auto">
            {/* Apply fade-in animation conditionally */}
            <Image
              src={currentCard.image}
              alt={currentCard.title}
              width={1500}
              height={500}
              className={`${
                fadeIn ? 'fade-in' : ''
              } rounded-md object-cover cursor-pointer lg:max-h-[500px] transition-opacity duration-500 ease-in-out`}
              onMouseEnter={() => setIsPaused(true)}
              onMouseLeave={() => setIsPaused(false)}
              onClick={handleImageClick}
            />
          </div>

          {/* Index Sidebar for Large Screens */}
          <div className="hidden lg:flex flex-col items-center ml-8 fade-in">
            <ol className="space-y-4 text-sm font-medium text-primary">
              {Array.from({ length: 4 }).map((_, index) => (
                <li className="flex items-center bg-background p-2" key={index}>
                  <button
                    className={`size-6 rounded-full text-center text-[15px] font-bold text-background ${index === currentIndex ? 'bg-primary' : 'bg-gray-400'}`}
                    onMouseEnter={() => setIndex(index)}
                    onMouseLeave={() => setIsPaused(false)}
                  >
                    {index + 1}
                  </button>
                </li>
              ))}
            </ol>
          </div>
        </div>

        {/* Modal for Enlarged Image */}
        {isModalOpen && (
          <div
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 fade-in"
            onClick={closeModal}
          >
            <div className="fade-in opacity-100 transition-opacity duration-500">
              <Image
                src={currentCard.image}
                alt={currentCard.title}
                width={1500}
                height={500}
                className="fade-in rounded-md object-cover cursor-pointer lg:max-h-[500px] transition-opacity duration-500 ease-in-out"
                onMouseEnter={() => setIsPaused(true)}
                onMouseLeave={() => setIsPaused(false)}
                onClick={handleImageClick}
              />
            </div>
          </div>
        )}
      </div>
    </section>

  );
};

export default CardSlider;