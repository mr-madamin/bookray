export const IPC = {
  OPEN_FILE:             'bookray:open-file',
  IMPORT_BOOK:           'bookray:import-book',
  LOAD_LIBRARY:          'bookray:load-library',
  GET_CHAPTER_CONTENT:   'bookray:get-chapter-content',
  PROGRESS_GET:          'bookray:progress-get',
  PROGRESS_SET:          'bookray:progress-set',
  AUDIO_GET_TRACKS:      'audio:get-tracks',
  AUDIO_IMPORT_FOLDER:   'audio:import-folder',
  AUDIO_UPDATE_DURATION: 'audio:update-duration',
} as const;
