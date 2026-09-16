"use client";

import React, { useState, useRef, useEffect } from "react";
import { Play, Pause, Loader2 } from "lucide-react";
import { Button } from "./button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "./dropdown-menu";

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
            className={`flex items-center gap-3 w-[280px] shrink-0 py-1 ${className}`}
            onClick={(e) => e.stopPropagation()}
        >
            <audio ref={audioRef} src={src} preload="auto" />

            <Button
                size="icon"
                variant="outline"
                className="h-9 w-9 shrink-0 rounded-lg border-muted-foreground/20 hover:bg-accent flex-none bg-background shadow-sm"
                onClick={togglePlay}
            >
                {isLoading && isPlaying ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : isPlaying ? (
                    <Pause className="h-4 w-4 fill-foreground stroke-none" />
                ) : (
                    <Play className="h-4 w-4 fill-foreground stroke-none ms-0.5" />
                )}
            </Button>

            <div className="flex flex-1 items-center gap-2 min-w-0">
                <span className="text-[10px] font-mono font-medium text-muted-foreground tabular-nums w-8 text-end flex-none">
                    {formatTime(currentTime)}
                </span>

                <div className="flex-1 h-6 flex items-center relative group/progress min-w-[60px]">
                    {/* The Rail */}
                    <div className="w-full h-[3px] bg-muted rounded-full relative overflow-hidden">
                        <div
                            className="h-full bg-foreground absolute left-0 top-0 transition-all duration-75 ease-linear"
                            style={{ width: `${progressPercent}%` }}
                        />
                    </div>

                    {/* The Actual Input - Ensure it always has a max if duration is unknown */}
                    <input
                        type="range"
                        min="0"
                        max={duration > 0 ? duration : 100}
                        value={currentTime}
                        step="0.1"
                        onChange={handleSeek}
                        disabled={duration <= 0}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20 disabled:cursor-not-allowed"
                    />

                    {/* Visual Thumb */}
                    <div
                        className="absolute h-2.5 w-2.5 bg-foreground rounded-full shadow-md opacity-0 group-hover/progress:opacity-100 transition-opacity pointer-events-none z-10"
                        style={{ left: `calc(${progressPercent}% - 5px)` }}
                    />
                </div>

                <span className="text-[10px] font-mono font-medium text-muted-foreground tabular-nums w-8 flex-none text-start">
                    {formatTime(duration)}
                </span>

                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-1 text-[10px] font-bold rounded-md hover:bg-muted text-muted-foreground hover:text-foreground shrink-0 flex-none"
                        >
                            {playbackSpeed}x
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-[60px]">
                        {[0.5, 0.75, 1, 1.25, 1.5, 2].map((speed) => (
                            <DropdownMenuItem
                                key={speed}
                                onClick={() => handleSpeedChange(speed)}
                                className={`text-[11px] px-2 py-1 ${playbackSpeed === speed ? 'bg-accent font-bold text-foreground' : 'text-muted-foreground'}`}
                            >
                                {speed}x
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </div>
    );
}
