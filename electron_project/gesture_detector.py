
import Quartz
import time
import math
import sys
import json
from threading import Thread

class GlobalGestureDetector:
    def __init__(self):
        self.gesture_points = []
        self.is_tracking = False
        self.last_pos = None
        self.gesture_start_time = 0
        self.movement_threshold = 5  # Minimum movement to register
        self.last_check_time = 0
        self.last_detection_time = 0  # Cooldown for detections
        self.detection_cooldown = 2.0  # 2 second cooldown between detections
        
    def mouse_event_callback(self, proxy, event_type, event, refcon):
        if not self.is_tracking:
            return event
            
        location = Quartz.CGEventGetLocation(event)
        x, y = location.x, location.y
        current_time = time.time()
        
        # Track all mouse movements, not just clicks
        if event_type == Quartz.kCGEventMouseMoved:
            # Only process if enough time has passed and mouse moved significantly
            if (current_time - self.last_check_time > 0.05 and  # 50ms throttle
                (self.last_pos is None or 
                 abs(x - self.last_pos['x']) > self.movement_threshold or 
                 abs(y - self.last_pos['y']) > self.movement_threshold)):
                
                self.gesture_points.append({'x': x, 'y': y, 'time': current_time})
                self.last_pos = {'x': x, 'y': y}
                self.last_check_time = current_time
                
                # Keep only recent points (last 3 seconds for natural movement)
                self.gesture_points = [p for p in self.gesture_points if current_time - p['time'] < 3.0]
                
                # Check for circular gesture continuously (increased threshold)
                if (len(self.gesture_points) > 30 and 
                    current_time - self.last_detection_time > self.detection_cooldown and 
                    self.detect_circular_gesture()):
                    print(json.dumps({'type': 'gesture_detected', 'points': len(self.gesture_points)}))
                    sys.stdout.flush()
                    # Clear ALL points and set cooldown to avoid repeated triggers
                    self.gesture_points = []
                    self.last_detection_time = current_time
                
        return event
    
    def detect_circular_gesture(self):
        if len(self.gesture_points) < 25:  # Increased minimum points
            return False
            
        recent_points = self.gesture_points[-30:]  # More points for better detection
        
        # Calculate center
        center_x = sum(p['x'] for p in recent_points) / len(recent_points)
        center_y = sum(p['y'] for p in recent_points) / len(recent_points)
        
        # Calculate minimum radius requirement
        distances = []
        for point in recent_points:
            distance = math.sqrt((point['x'] - center_x)**2 + (point['y'] - center_y)**2)
            distances.append(distance)
        avg_radius = sum(distances) / len(distances)
        
        # Require minimum radius of 50 pixels to prevent accidental detection
        if avg_radius < 50:
            return False
        
        # Calculate angles
        angles = []
        for point in recent_points:
            angle = math.atan2(point['y'] - center_y, point['x'] - center_x)
            angles.append(angle)
        
        # Check total angle change
        total_angle_change = 0
        for i in range(1, len(angles)):
            angle_diff = angles[i] - angles[i-1]
            
            # Normalize angle difference
            if angle_diff > math.pi:
                angle_diff -= 2 * math.pi
            elif angle_diff < -math.pi:
                angle_diff += 2 * math.pi
                
            total_angle_change += abs(angle_diff)
        
        # Require at least 80% of a full circle for more reliable detection
        return total_angle_change > math.pi * 1.6
    
    def start_monitoring(self):
        self.is_tracking = True
        event_mask = (
            Quartz.CGEventMaskBit(Quartz.kCGEventMouseMoved)
        )
        
        tap = Quartz.CGEventTapCreate(
            Quartz.kCGSessionEventTap,
            Quartz.kCGHeadInsertEventTap,
            Quartz.kCGEventTapOptionDefault,
            event_mask,
            self.mouse_event_callback,
            None
        )
        
        if tap is None:
            print(json.dumps({'type': 'error', 'message': 'Failed to create event tap. Need accessibility permissions.'}))
            sys.stdout.flush()
            return
            
        run_loop_source = Quartz.CFMachPortCreateRunLoopSource(None, tap, 0)
        Quartz.CFRunLoopAddSource(
            Quartz.CFRunLoopGetCurrent(),
            run_loop_source,
            Quartz.kCFRunLoopDefaultMode
        )
        
        Quartz.CGEventTapEnable(tap, True)
        print(json.dumps({'type': 'started', 'message': 'Global gesture detection started'}))
        sys.stdout.flush()
        
        try:
            Quartz.CFRunLoopRun()
        except KeyboardInterrupt:
            print(json.dumps({'type': 'stopped', 'message': 'Global gesture detection stopped'}))
            sys.stdout.flush()

if __name__ == '__main__':
    detector = GlobalGestureDetector()
    
    # Listen for commands from stdin
    def handle_commands():
        for line in sys.stdin:
            try:
                cmd = json.loads(line.strip())
                if cmd.get('action') == 'start':
                    detector.is_tracking = True
                elif cmd.get('action') == 'stop':
                    detector.is_tracking = False
                elif cmd.get('action') == 'quit':
                    break
            except:
                pass
    
    # Start command handler in separate thread
    Thread(target=handle_commands, daemon=True).start()
    
    # Start monitoring
    detector.start_monitoring()
