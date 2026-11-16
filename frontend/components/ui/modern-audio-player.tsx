"use client";

import React, { useState, useRef, useEffect } from "react";
import { Play, Pause } from "@phosphor-icons/react";
import {
    Button,
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuTrigger,
    Spinner,
} from "@wixzel/react";
import { cn } from "@/lib/utils";

interface ModernAudioPlayerProps {
    src: string;
    className?: string;
}

export function ModernAudioPlayer({ src, className }: ModernAudioPlayerProps) {
    const audioRef = useRef<HTMLAudioElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [playbackSpeed, setPlaybackSpeed] = useState(1);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const setAudioData = () => {
            if (Number.isFinite(audio.duration) && audio.duration > 0) {
                setDuration(audio.duration);
            }
            setIsLoading(false);
        };

        const setAudioTime = () => {
            setCurrentTime(audio.currentTime);
            // Aggressively capture duration if state is out of sync and metadata is ready
            if (audio.duration > 0 && Number.isFinite(audio.duration)) {
                setDuration(prev => (prev === 0 ? audio.duration : prev));
            }
        };
        const onEnd = () => {
            setIsPlaying(false);
            setCurrentTime(0);
        };

        // If metadata is already loaded (e.g. from cache)
        if (audio.readyState >= 1) {
            setAudioData();
        }

        audio.addEventListener("loadedmetadata", setAudioData);
        audio.addEventListener("durationchange", setAudioData);
        audio.addEventListener("timeupdate", setAudioTime);
        audio.addEventListener("ended", onEnd);
        audio.addEventListener("waiting", () => setIsLoading(true));
        audio.addEventListener("playing", () => setIsLoading(false));
        audio.addEventListener("canplay", () => setIsLoading(false));

        return () => {
            audio.removeEventListener("loadedmetadata", setAudioData);
            audio.removeEventListener("durationchange", setAudioData);
            audio.removeEventListener("timeupdate", setAudioTime);
            audio.removeEventListener("ended", onEnd);
            audio.removeEventListener("waiting", () => setIsLoading(true));
            audio.removeEventListener("playing", () => setIsLoading(false));
            audio.removeEventListener("canplay", () => setIsLoading(false));
        };
    }, [src]);

    const togglePlay = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!audioRef.current) return;

        if (isPlaying) {
            audioRef.current.pause();
        } else {
            // Re-sync duration just in case
            if (audioRef.current.duration > 0) {
                setDuration(audioRef.current.duration);
            }
            audioRef.current.play().catch(err => console.error("Playback failed:", err));
        }
        setIsPlaying(!isPlaying);
    };

    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
        e.stopPropagation();
        const time = parseFloat(e.target.value);
        if (audioRef.current && Number.isFinite(time) && audioRef.current.readyState >= 1) {
            try {
                audioRef.current.currentTime = time;
                setCurrentTime(time);
            } catch (err) {
                console.error("Seeking failed:", err);
            }
        }
    };

    const handleSpeedChange = (speed: number) => {
        if (audioRef.current) {
            audioRef.current.playbackRate = speed;
        }
        setPlaybackSpeed(speed);
    };

    const formatTime = (time: number) => {
        if (!Number.isFinite(time) || time < 0) return "0:00";
        const mins = Math.floor(time / 60);
        const secs = Math.floor(time % 60);
        return `${mins}:${secs.toString().padStart(2, "0")}`;
    };

    const progressPercent = duration > 0
        ? Math.min(100, Math.max(0, (currentTime / duration) * 100))
        : 0;

    return (
        <div
            className={cn("flex w-[280px] shrink-0 items-center gap-3 py-1", className)}
            onClick={(e) => e.stopPropagation()}
        >
            <audio ref={audioRef} src={src} preload="auto" />

            <Button size="icon" onClick={togglePlay}>
                {isLoading && isPlaying ? <Spinner /> : isPlaying ? <Pause weight="fill" /> : <Play weight="fill" />}
            </Button>

            <div className="flex min-w-0 flex-1 items-center gap-2">
                <span className="w-8 flex-none text-end font-mono text-caption tabular-nums text-fg-muted">
                    {formatTime(currentTime)}
                </span>

                <div className="group/progress relative flex h-6 min-w-[60px] flex-1 items-center">
                    {/* The track and how far it has played. */}
                    <div className="relative h-1 w-full overflow-hidden rounded-full bg-bg-muted">
                        <div
                            className="absolute inset-y-0 start-0 rounded-full bg-accent"
                            style={{ width: `${progressPercent}%` }}
                        />
                    </div>

                    {/* The actual input - always has a max, even while the duration is unknown. */}
                    <input
                        type="range"
                        min="0"
                        max={duration > 0 ? duration : 100}
                        value={currentTime}
                        step="0.1"
                        onChange={handleSeek}
                        disabled={duration <= 0}
                        className="absolute inset-0 z-20 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
                    />

                    {/* Visual thumb. */}
                    <div
                        className="pointer-events-none absolute z-10 size-3 rounded-full bg-accent opacity-0 shadow-[0_0_0_2px_var(--wx-color-bg)] transition-opacity group-hover/progress:opacity-100"
                        style={{ insetInlineStart: `calc(${progressPercent}% - 6px)` }}
                    />
                </div>

                <span className="w-8 flex-none text-start font-mono text-caption tabular-nums text-fg-muted">
                    {formatTime(duration)}
                </span>

                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="xs" className="flex-none tabular-nums">
                            {playbackSpeed}x
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-[88px]">
                        <DropdownMenuRadioGroup
                            value={String(playbackSpeed)}
                            onValueChange={(value) => handleSpeedChange(Number(value))}
                        >
                            {[0.5, 0.75, 1, 1.25, 1.5, 2].map((speed) => (
                                <DropdownMenuRadioItem key={speed} value={String(speed)} className="tabular-nums">
                                    {speed}x
                                </DropdownMenuRadioItem>
                            ))}
                        </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </div>
    );
}
