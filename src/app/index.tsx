import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Notifications from 'expo-notifications';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

type Priority = 'High' | 'Medium' | 'Low';
type Category = 'College' | 'Learning' | 'Projects' | 'Personal';
type StatusFilter = 'All' | 'Pending' | 'Completed';
type SortOption = 'Priority: High to Low' | 'Priority: Low to High' | 'Newest First';

type Task = {
  id: number;
  title: string;
  category: Category;
  priority: Priority;
  dueDate: string;
  reminderTime: string;
  completed: boolean;
  notificationId?: string;
};

const STORAGE_KEY = '@taskflow_tasks';
const DEFAULT_REMINDER_TIME = '09:00';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Convert a Date into DD MMM YYYY.
const formatDate = (date: Date) =>
  date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

// Convert a Date into HH:mm.
const formatTimeForStorage = (date: Date) => {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
};

// Convert HH:mm into a readable time such as 7:00 AM.
const formatTimeForDisplay = (time: string) => {
  const [hours, minutes] = time.split(':').map(Number);
  const date = new Date();
  date.setHours(hours || 0, minutes || 0, 0, 0);

  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
};

// Convert DD MMM YYYY and HH:mm into a local Date.
const parseDueDateAndTime = (dueDate: string, reminderTime: string) => {
  const [day, month, year] = dueDate.split(' ');
  const monthIndex = new Date(`${month} 1, 2000`).getMonth();
  const [hours, minutes] = reminderTime.split(':').map(Number);

  if (
    !day ||
    !month ||
    !year ||
    Number.isNaN(monthIndex) ||
    Number.isNaN(Number(year))
  ) {
    return null;
  }

  const result = new Date(
    Number(year),
    monthIndex,
    Number(day),
    hours || 0,
    minutes || 0,
    0,
    0,
  );

  return Number.isNaN(result.getTime()) ? null : result;
};

const parseDate = (dateString: string) => {
  const parsed = parseDueDateAndTime(dateString, '00:00');
  return parsed ?? new Date();
};

export default function HomeScreen() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  const [taskTitle, setTaskTitle] = useState('');
  const [selectedCategory, setSelectedCategory] =
    useState<Category>('College');
  const [selectedPriority, setSelectedPriority] =
    useState<Priority>('Medium');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedTime, setSelectedTime] = useState(
    new Date(2000, 0, 1, 9, 0, 0),
  );

  const [editingId, setEditingId] = useState<number | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [sortOption, setSortOption] =
    useState<SortOption>('Priority: High to Low');

  // Load saved tasks when the app starts.
  useEffect(() => {
    const loadTasks = async () => {
      try {
        const savedTasks = await AsyncStorage.getItem(STORAGE_KEY);

        if (savedTasks) {
          const parsedTasks: Task[] = JSON.parse(savedTasks);

          // Older tasks may not have a reminderTime.
          const normalizedTasks = parsedTasks.map((task) => ({
            ...task,
            reminderTime: task.reminderTime ?? DEFAULT_REMINDER_TIME,
          }));

          setTasks(normalizedTasks);
        }
      } catch (error) {
        console.log('Could not load tasks:', error);
      } finally {
        setIsLoaded(true);
      }
    };

    loadTasks();
  }, []);

  // Save tasks whenever the task list changes.
  useEffect(() => {
    if (!isLoaded) return;

    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(tasks)).catch((error) =>
      console.log('Could not save tasks:', error),
    );
  }, [tasks, isLoaded]);

  const completedCount = tasks.filter((task) => task.completed).length;
  const progress =
    tasks.length === 0 ? 0 : completedCount / tasks.length;

  const priorityOrder: Record<Priority, number> = {
    High: 3,
    Medium: 2,
    Low: 1,
  };

  // Schedule a local notification for a task.
  const scheduleReminder = async (
    dueDate: string,
    reminderTime: string,
    title: string,
  ): Promise<string | undefined> => {
    try {
      const reminderDate = parseDueDateAndTime(dueDate, reminderTime);

      if (!reminderDate || reminderDate.getTime() <= Date.now()) {
        return undefined;
      }

      let permission = await Notifications.getPermissionsAsync();

      if (!permission.granted) {
        permission = await Notifications.requestPermissionsAsync();
      }

      if (!permission.granted) {
        Alert.alert(
          'Notifications disabled',
          'Your task was saved, but TaskFlow cannot schedule its reminder until notification permission is allowed.',
        );
        return undefined;
      }

      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: 'TaskFlow Reminder 🔔',
          body: `It's time for: ${title}`,
          sound: true,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: reminderDate,
        },
      });

      return notificationId;
    } catch (error) {
      console.log('Reminder scheduling failed:', error);
      return undefined;
    }
  };

  const cancelReminder = async (notificationId?: string) => {
    if (!notificationId) return;

    try {
      await Notifications.cancelScheduledNotificationAsync(notificationId);
    } catch (error) {
      console.log('Could not cancel reminder:', error);
    }
  };

  const resetForm = () => {
    setTaskTitle('');
    setSelectedCategory('College');
    setSelectedPriority('Medium');
    setSelectedDate(new Date());
    setSelectedTime(new Date(2000, 0, 1, 9, 0, 0));
    setEditingId(null);
  };

  const saveTask = async () => {
    const trimmedTitle = taskTitle.trim();

    if (!trimmedTitle) {
      Alert.alert('Task title required', 'Please enter a task name.');
      return;
    }

    const dueDate = formatDate(selectedDate);
    const reminderTime = formatTimeForStorage(selectedTime);

    if (editingId !== null) {
      const oldTask = tasks.find((task) => task.id === editingId);

      if (!oldTask) return;

      await cancelReminder(oldTask.notificationId);

      const notificationId = oldTask.completed
  ? undefined
  : await scheduleReminder(dueDate, reminderTime, trimmedTitle);

      const updatedTask: Task = {
        ...oldTask,
        title: trimmedTitle,
        category: selectedCategory,
        priority: selectedPriority,
        dueDate,
        reminderTime,
        notificationId,
      };

      setTasks((currentTasks) =>
        currentTasks.map((task) =>
          task.id === editingId ? updatedTask : task,
        ),
      );
    } else {
      const newTaskId = Date.now();

      const notificationId = await scheduleReminder(
        dueDate,
        reminderTime,
        trimmedTitle,
      );

      const newTask: Task = {
        id: newTaskId,
        title: trimmedTitle,
        category: selectedCategory,
        priority: selectedPriority,
        dueDate,
        reminderTime,
        completed: false,
        notificationId,
      };

      setTasks((currentTasks) => [newTask, ...currentTasks]);
    }

    resetForm();
  };

  const editTask = (task: Task) => {
    setTaskTitle(task.title);
    setSelectedCategory(task.category);
    setSelectedPriority(task.priority);
    setSelectedDate(parseDate(task.dueDate));

    const [hours, minutes] = (task.reminderTime ?? DEFAULT_REMINDER_TIME)
      .split(':')
      .map(Number);

    setSelectedTime(new Date(2000, 0, 1, hours || 0, minutes || 0));
    setEditingId(task.id);
  };

  const deleteTask = (task: Task) => {
    Alert.alert('Delete task', `Delete "${task.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await cancelReminder(task.notificationId);
          setTasks((currentTasks) =>
            currentTasks.filter((item) => item.id !== task.id),
          );

          if (editingId === task.id) resetForm();
        },
      },
    ]);
  };

  const toggleTask = async (task: Task) => {
    if (!task.completed) {
      // Completing a task cancels its reminder.
      await cancelReminder(task.notificationId);

      setTasks((currentTasks) =>
        currentTasks.map((item) =>
          item.id === task.id
            ? { ...item, completed: true, notificationId: undefined }
            : item,
        ),
      );
    } else {
      // Reopening a task schedules its reminder again if the time is future.
      const notificationId = await scheduleReminder(
        task.dueDate,
        task.reminderTime ?? DEFAULT_REMINDER_TIME,
        task.title,
      );

      setTasks((currentTasks) =>
        currentTasks.map((item) =>
          item.id === task.id
            ? { ...item, completed: false, notificationId }
            : item,
        ),
      );
    }
  };

  const testNotification = async () => {
    try {
      let permission = await Notifications.getPermissionsAsync();

      if (!permission.granted) {
        permission = await Notifications.requestPermissionsAsync();
      }

      if (!permission.granted) {
        Alert.alert(
          'Permission required',
          'Please allow notifications in your phone settings.',
        );
        return;
      }

      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'TaskFlow Reminder 🔔',
          body: 'Your test notification is working!',
          sound: true,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: 5,
        },
      });

      Alert.alert(
        'Test scheduled',
        'You should receive a notification in about 5 seconds.',
      );
    } catch (error) {
      console.log('Test notification failed:', error);
      Alert.alert('Notification error', 'Could not schedule the test reminder.');
    }
  };

  const filteredTasks = useMemo(() => {
    let result = tasks.filter((task) =>
      task.title.toLowerCase().includes(searchText.toLowerCase()),
    );

    if (statusFilter === 'Pending') {
      result = result.filter((task) => !task.completed);
    } else if (statusFilter === 'Completed') {
      result = result.filter((task) => task.completed);
    }

    if (categoryFilter !== 'All') {
      result = result.filter((task) => task.category === categoryFilter);
    }

    result = [...result];

    if (sortOption === 'Priority: High to Low') {
      result.sort(
        (a, b) => priorityOrder[b.priority] - priorityOrder[a.priority],
      );
    } else if (sortOption === 'Priority: Low to High') {
      result.sort(
        (a, b) => priorityOrder[a.priority] - priorityOrder[b.priority],
      );
    } else {
      result.sort((a, b) => b.id - a.id);
    }

    return result;
  }, [tasks, searchText, statusFilter, categoryFilter, sortOption]);

  const renderChoice = (
    label: string,
    selected: boolean,
    onPress: () => void,
  ) => (
    <TouchableOpacity
      key={label}
      style={[styles.choice, selected && styles.choiceSelected]}
      onPress={onPress}
    >
      <Text
        style={[
          styles.choiceText,
          selected && styles.choiceTextSelected,
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.logo}>TaskFlow</Text>
          <Text style={styles.subtitle}>Make today count.</Text>
        </View>

        <View style={styles.avatar}>
          <Text style={styles.avatarText}>T</Text>
        </View>
      </View>

      <Text style={styles.greeting}>Hello! 👋</Text>
      <Text style={styles.intro}>Let's organize your day.</Text>

      <View style={styles.progressCard}>
        <Text style={styles.progressTitle}>Your daily progress</Text>
        <Text style={styles.progressCount}>
          {completedCount} of {tasks.length} tasks completed
        </Text>

        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              { width: `${progress * 100}%` },
            ]}
          />
        </View>

        <Text style={styles.progressPercent}>
          {Math.round(progress * 100)}% completed
        </Text>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>
          {editingId !== null ? 'Edit task' : 'Add a task'}
        </Text>
      </View>

      <View style={styles.formCard}>
        <Text style={styles.fieldLabel}>Task name</Text>
        <TextInput
          style={styles.input}
          placeholder="What do you need to do?"
          value={taskTitle}
          onChangeText={setTaskTitle}
        />

        <Text style={styles.fieldLabel}>Category</Text>
        <View style={styles.choiceRow}>
          {(['College', 'Learning', 'Projects', 'Personal'] as Category[]).map(
            (category) =>
              renderChoice(
                category,
                selectedCategory === category,
                () => setSelectedCategory(category),
              ),
          )}
        </View>

        <Text style={styles.fieldLabel}>Priority</Text>
        <View style={styles.choiceRow}>
          {(['High', 'Medium', 'Low'] as Priority[]).map((priority) =>
            renderChoice(
              priority,
              selectedPriority === priority,
              () => setSelectedPriority(priority),
            ),
          )}
        </View>

        <Text style={styles.fieldLabel}>Due date</Text>
        <TouchableOpacity
          style={styles.pickerButton}
          onPress={() => setShowDatePicker(true)}
        >
          <Text style={styles.pickerButtonText}>
            <Text>{formatDate(selectedDate)}</Text>
          </Text>
          <Text style={styles.pickerIcon}>📅</Text>
        </TouchableOpacity>

        <Text style={styles.fieldLabel}>Reminder time</Text>
        <TouchableOpacity
          style={styles.pickerButton}
          onPress={() => setShowTimePicker(true)}
        >
          <Text style={styles.pickerButtonText}>
            {formatTimeForDisplay(formatTimeForStorage(selectedTime))}
          </Text>
          <Text style={styles.pickerIcon}>⏰</Text>
        </TouchableOpacity>

        <Text style={styles.helperText}>
          Your reminder will arrive on the due date at this time.
        </Text>

        {showDatePicker && (
          <DateTimePicker
            value={selectedDate}
            mode="date"
            display="default"
            onChange={(event, date) => {
              setShowDatePicker(false);
              if (date) setSelectedDate(date);
            }}
          />
        )}

        {showTimePicker && (
          <DateTimePicker
            value={selectedTime}
            mode="time"
            display="default"
            onChange={(event, date) => {
              setShowTimePicker(false);
              if (date) setSelectedTime(date);
            }}
          />
        )}

        <TouchableOpacity style={styles.primaryButton} onPress={saveTask}>
          <Text style={styles.primaryButtonText}>
            {editingId !== null ? 'Save Changes' : '+ Add Task'}
          </Text>
        </TouchableOpacity>

        {editingId !== null && (
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={resetForm}
          >
            <Text style={styles.cancelButtonText}>Cancel editing</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>My tasks</Text>
        <Text style={styles.taskCount}>{tasks.length} total</Text>
      </View>

      <TextInput
        style={styles.input}
        placeholder="🔍 Search tasks..."
        value={searchText}
        onChangeText={setSearchText}
      />

      <Text style={styles.fieldLabel}>Status</Text>
      <View style={styles.choiceRow}>
        {(['All', 'Pending', 'Completed'] as StatusFilter[]).map((filter) =>
          renderChoice(filter, statusFilter === filter, () =>
            setStatusFilter(filter),
          ),
        )}
      </View>

      <Text style={styles.fieldLabel}>Category filter</Text>
      <View style={styles.choiceRow}>
        {['All', 'College', 'Learning', 'Projects', 'Personal'].map(
          (category) =>
            renderChoice(category, categoryFilter === category, () =>
              setCategoryFilter(category),
            ),
        )}
      </View>

      <Text style={styles.fieldLabel}>Sort tasks</Text>
      <View style={styles.choiceRow}>
        {(
          [
            'Priority: High to Low',
            'Priority: Low to High',
            'Newest First',
          ] as SortOption[]
        ).map((option) =>
          renderChoice(option, sortOption === option, () =>
            setSortOption(option),
          ),
        )}
      </View>

      <Text style={styles.resultCount}>
        Showing {filteredTasks.length} task(s)
      </Text>

      {filteredTasks.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyEmoji}>📝</Text>
          <Text style={styles.emptyTitle}>No tasks found</Text>
          <Text style={styles.emptyText}>
            Add a task or change your search and filters.
          </Text>
        </View>
      ) : (
        filteredTasks.map((task) => (
          <View key={task.id} style={styles.taskCard}>
            <View style={styles.taskTopRow}>
              <TouchableOpacity
                style={[
                  styles.checkbox,
                  task.completed && styles.checkboxCompleted,
                ]}
                onPress={() => toggleTask(task)}
              >
                <Text style={styles.checkboxText}>
                  {task.completed ? '✓' : ''}
                </Text>
              </TouchableOpacity>

              <View style={styles.taskDetails}>
                <Text
                  style={[
                    styles.taskTitle,
                    task.completed && styles.completedTaskTitle,
                  ]}
                >
                  {task.title}
                </Text>

                <Text style={styles.taskMeta}>
                  {task.category} • Due {task.dueDate}
                </Text>

                <Text style={styles.reminderText}>
                  ⏰ Reminder: {formatTimeForDisplay(
                    task.reminderTime ?? DEFAULT_REMINDER_TIME,
                  )}
                </Text>

                <View style={styles.tagRow}>
                  <Text
                    style={[
                      styles.priorityTag,
                      task.priority === 'High' && styles.highPriority,
                      task.priority === 'Medium' && styles.mediumPriority,
                      task.priority === 'Low' && styles.lowPriority,
                    ]}
                  >
                    {task.priority}
                  </Text>

                  <Text style={styles.categoryTag}>{task.category}</Text>
                </View>
              </View>
            </View>

            <View style={styles.taskActions}>
              <TouchableOpacity
                style={styles.editButton}
                onPress={() => editTask(task)}
              >
                <Text style={styles.editButtonText}>Edit</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.deleteButton}
                onPress={() => deleteTask(task)}
              >
                <Text style={styles.deleteButtonText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))
      )}

      <TouchableOpacity
        style={styles.testButton}
        onPress={testNotification}
      >
        <Text style={styles.testButtonText}>
          🔔 Test notification (5 seconds)
        </Text>
      </TouchableOpacity>

      <Text style={styles.footer}>
        TaskFlow • Plan better. Do better.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F6F5FB',
  },
  content: {
    padding: 20,
    paddingTop: 55,
    paddingBottom: 45,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 28,
  },
  logo: {
    fontSize: 27,
    fontWeight: '800',
    color: '#6546D7',
  },
  subtitle: {
    color: '#777386',
    marginTop: 3,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#E6DFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#6546D7',
    fontSize: 19,
    fontWeight: '800',
  },
  greeting: {
    fontSize: 25,
    fontWeight: '800',
    color: '#242136',
  },
  intro: {
    fontSize: 15,
    color: '#777386',
    marginTop: 5,
    marginBottom: 20,
  },
  progressCard: {
    backgroundColor: '#6546D7',
    borderRadius: 18,
    padding: 20,
    marginBottom: 28,
  },
  progressTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  progressCount: {
    color: '#EAE4FF',
    marginTop: 8,
  },
  progressTrack: {
    height: 9,
    backgroundColor: '#9A83E8',
    borderRadius: 10,
    marginTop: 16,
    overflow: 'hidden',
  },
  progressFill: {
    height: 9,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
  },
  progressPercent: {
    color: '#FFFFFF',
    marginTop: 9,
    textAlign: 'right',
    fontWeight: '600',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 13,
    marginTop: 5,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#242136',
  },
  taskCount: {
    color: '#777386',
  },
  formCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 17,
    padding: 16,
    marginBottom: 25,
  },
  fieldLabel: {
    color: '#403B53',
    fontWeight: '700',
    marginTop: 15,
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E1EF',
    borderRadius: 11,
    paddingHorizontal: 13,
    paddingVertical: 13,
    color: '#242136',
    marginBottom: 8,
  },
  choiceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  choice: {
    borderWidth: 1,
    borderColor: '#E3DFED',
    backgroundColor: '#FFFFFF',
    borderRadius: 9,
    paddingVertical: 8,
    paddingHorizontal: 11,
    marginBottom: 4,
  },
  choiceSelected: {
    backgroundColor: '#EEE9FF',
    borderColor: '#7658DF',
  },
  choiceText: {
    color: '#625D70',
    fontSize: 12,
    fontWeight: '600',
  },
  choiceTextSelected: {
    color: '#6546D7',
  },
  pickerButton: {
    backgroundColor: '#F8F7FC',
    borderWidth: 1,
    borderColor: '#E5E1EF',
    borderRadius: 11,
    padding: 13,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pickerButtonText: {
    color: '#302B42',
    fontWeight: '600',
  },
  pickerIcon: {
    fontSize: 18,
  },
  helperText: {
    color: '#858092',
    fontSize: 12,
    marginTop: 8,
  },
  primaryButton: {
    backgroundColor: '#6546D7',
    padding: 15,
    borderRadius: 11,
    alignItems: 'center',
    marginTop: 20,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
  },
  cancelButton: {
    alignItems: 'center',
    padding: 12,
  },
  cancelButtonText: {
    color: '#777386',
    fontWeight: '600',
  },
  resultCount: {
    color: '#777386',
    marginTop: 13,
    marginBottom: 10,
    fontSize: 12,
  },
  taskCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 15,
    padding: 15,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#ECE9F3',
  },
  taskTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  checkbox: {
    width: 25,
    height: 25,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#A99BCF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    marginTop: 2,
  },
  checkboxCompleted: {
    backgroundColor: '#6546D7',
    borderColor: '#6546D7',
  },
  checkboxText: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
  taskDetails: {
    flex: 1,
  },
  taskTitle: {
    color: '#29253A',
    fontSize: 16,
    fontWeight: '700',
  },
  completedTaskTitle: {
    color: '#9691A2',
    textDecorationLine: 'line-through',
  },
  taskMeta: {
    color: '#858092',
    fontSize: 12,
    marginTop: 5,
  },
  reminderText: {
    color: '#6546D7',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 6,
  },
  tagRow: {
    flexDirection: 'row',
    gap: 7,
    marginTop: 9,
    flexWrap: 'wrap',
  },
  priorityTag: {
    overflow: 'hidden',
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    fontSize: 11,
    fontWeight: '700',
  },
  highPriority: {
    color: '#B42318',
    backgroundColor: '#FEE4E2',
  },
  mediumPriority: {
    color: '#9A6700',
    backgroundColor: '#FFF2CC',
  },
  lowPriority: {
    color: '#18794E',
    backgroundColor: '#DDF5E8',
  },
  categoryTag: {
    color: '#6546D7',
    backgroundColor: '#EEE9FF',
    overflow: 'hidden',
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    fontSize: 11,
    fontWeight: '700',
  },
  taskActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 9,
    marginTop: 14,
  },
  editButton: {
    backgroundColor: '#EEE9FF',
    paddingVertical: 8,
    paddingHorizontal: 17,
    borderRadius: 8,
  },
  editButtonText: {
    color: '#6546D7',
    fontWeight: '700',
  },
  deleteButton: {
    backgroundColor: '#FFF0EF',
    paddingVertical: 8,
    paddingHorizontal: 17,
    borderRadius: 8,
  },
  deleteButtonText: {
    color: '#C43D35',
    fontWeight: '700',
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 15,
    padding: 25,
    alignItems: 'center',
    marginTop: 5,
  },
  emptyEmoji: {
    fontSize: 32,
    marginBottom: 8,
  },
  emptyTitle: {
    color: '#302B42',
    fontSize: 16,
    fontWeight: '700',
  },
  emptyText: {
    color: '#858092',
    textAlign: 'center',
    marginTop: 6,
    fontSize: 13,
  },
  testButton: {
    backgroundColor: '#29253A',
    borderRadius: 11,
    padding: 15,
    alignItems: 'center',
    marginTop: 20,
  },
  testButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  footer: {
    textAlign: 'center',
    color: '#9994A6',
    fontSize: 12,
    marginTop: 25,
  },
});