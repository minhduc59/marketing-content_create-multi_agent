"use client";

import { useState, useMemo } from "react";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
  startOfWeek,
  endOfWeek,
} from "date-fns";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { usePublishHistory, useCancelSchedule } from "@/hooks/api/use-publish";

export default function SchedulePage() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  const { data: publishData } = usePublishHistory({ pageSize: 100 });
  const cancelSchedule = useCancelSchedule();

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const scheduledItems = useMemo(() => {
    return (
      publishData?.items?.filter(
        (p) => p.scheduledAt && p.status !== "cancelled"
      ) ?? []
    );
  }, [publishData]);

  function getPostsForDay(day: Date) {
    return scheduledItems.filter(
      (p) => p.scheduledAt && isSameDay(new Date(p.scheduledAt), day)
    );
  }

  const selectedDayPosts = selectedDay ? getPostsForDay(selectedDay) : [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Schedule</h1>

      {!scheduledItems.length && !selectedDay ? (
        <EmptyState
          icon={Calendar}
          title="Nothing scheduled"
          description="Approve and schedule content to see it here."
          action={{ label: "Browse Content", href: "/content" }}
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Calendar */}
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">
                {format(currentMonth, "MMMM yyyy")}
              </CardTitle>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCurrentMonth(new Date())}
                >
                  Today
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-7 gap-px">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(
                  (day) => (
                    <div
                      key={day}
                      className="p-2 text-center text-xs font-medium text-muted-foreground"
                    >
                      {day}
                    </div>
                  )
                )}
                {days.map((day) => {
                  const posts = getPostsForDay(day);
                  const isSelected = selectedDay && isSameDay(day, selectedDay);
                  const isCurrentMonth = isSameMonth(day, currentMonth);
                  const isToday = isSameDay(day, new Date());

                  return (
                    <button
                      key={day.toISOString()}
                      onClick={() => setSelectedDay(day)}
                      className={`min-h-[80px] border p-1 text-left transition-colors ${
                        isSelected
                          ? "border-foreground bg-accent"
                          : "hover:bg-accent/50"
                      } ${!isCurrentMonth ? "opacity-40" : ""}`}
                    >
                      <span
                        className={`text-xs ${
                          isToday ? "font-bold" : "text-muted-foreground"
                        }`}
                      >
                        {format(day, "d")}
                      </span>
                      <div className="mt-1 space-y-0.5">
                        {posts.slice(0, 3).map((post) => (
                          <div
                            key={post.id}
                            className="h-1.5 w-full bg-blue-500"
                            title={`${post.platform} - ${
                              post.scheduledAt
                                ? format(new Date(post.scheduledAt), "HH:mm")
                                : ""
                            }`}
                          />
                        ))}
                        {posts.length > 3 && (
                          <span className="text-[10px] text-muted-foreground">
                            +{posts.length - 3}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Day Detail Panel */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {selectedDay
                  ? format(selectedDay, "EEEE, MMM d")
                  : "Select a day"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!selectedDay ? (
                <p className="text-sm text-muted-foreground">
                  Click a day on the calendar to view scheduled posts.
                </p>
              ) : selectedDayPosts.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No posts scheduled for this day.
                </p>
              ) : (
                <div className="space-y-3">
                  {selectedDayPosts.map((post) => (
                    <div key={post.id} className="border p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium uppercase text-muted-foreground">
                          {post.platform}
                        </span>
                        <span className="font-mono text-xs">
                          {post.scheduledAt
                            ? format(new Date(post.scheduledAt), "HH:mm")
                            : "—"}
                        </span>
                      </div>
                      <p className="text-sm">{post.status}</p>
                      {post.goldenHourSlot && (
                        <p className="text-xs text-muted-foreground">
                          Golden hour: {post.goldenHourSlot}
                        </p>
                      )}
                      <Button
                        variant="destructive"
                        size="sm"
                        className="w-full"
                        onClick={() =>
                          cancelSchedule.mutate(post.contentPostId)
                        }
                        disabled={cancelSchedule.isPending}
                      >
                        Cancel
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
