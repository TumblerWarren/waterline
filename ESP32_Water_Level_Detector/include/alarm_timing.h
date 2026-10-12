#pragma once
#include <stdint.h>
constexpr bool alarmSoundPhase(uint32_t elapsed,uint32_t onSeconds,uint32_t offSeconds) {
 return elapsed%((onSeconds+offSeconds)*1000U)<onSeconds*1000U;
}
static_assert(alarmSoundPhase(0,10,50),"Starts sounding immediately");
static_assert(alarmSoundPhase(9999,10,50),"Ten-second sound window");
static_assert(!alarmSoundPhase(10000,10,50),"Silence starts at ten seconds");
static_assert(!alarmSoundPhase(59999,10,50),"Fifty-second silent window");
static_assert(alarmSoundPhase(60000,10,50),"Repeats once per minute");
